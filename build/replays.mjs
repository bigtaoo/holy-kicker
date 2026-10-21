import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Reads replays (server/src/replayStats.ts): where the time went, how the horde stood around
// the hero, how the stick was played, what hurt and what killed, which cards were taken.
// Each replay is played on the engine it was recorded with: an older ENGINE_VERSION's engine/
// is taken from git (the last commit before the next bump) into a cache under the temp dir.
// Usage: npm run replays -- [file.json ...] [--fetch[=N]] [--collected[=N]] [--json=out.json]
//   file.json: a problem report (GET /v1/reports/<id>), a collected replay or a bare replay.
//   --fetch=N: the newest N problem reports from hk.gamestao.com (HK_ADMIN_KEY in the environment).
//   --collected=N: the newest N collected run replays (server/src/replayShelf.ts), likewise.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API = 'https://hk.gamestao.com';
const args = process.argv.slice(2);
const fetchArg = args.find((a) => a.startsWith('--fetch'));
const collectedArg = args.find((a) => a.startsWith('--collected'));
const jsonArg = args.find((a) => a.startsWith('--json='));
const files = args.filter((a) => !a.startsWith('--'));

async function adminGet(path) {
  const key = process.env.HK_ADMIN_KEY;
  if (!key) throw new Error('--fetch and --collected need HK_ADMIN_KEY');
  return (await fetch(API + path, { headers: { authorization: `Bearer ${key}` } })).json();
}

async function fetchReports(n) {
  const list = await adminGet(`/v1/reports?limit=${n}`);
  return Promise.all((list.reports ?? list).filter((r) => r.ticks > 0).map(async (r) => ({ id: r.id, ...(await adminGet(`/v1/reports/${r.id}`)) })));
}

/** Collected replays, each a run of its own (a run's sends replace each other on the server). */
async function fetchCollected(n) {
  const list = await adminGet(`/v1/replays?limit=${n}`);
  return Promise.all(list.map(async (e) => ({ id: e.name, run: e.name, ...(await adminGet(`/v1/replays/${e.name}`)) })));
}

/** Each ENGINE_VERSION's last commit: the parent of the commit that bumped it next; HEAD's own is the working tree. */
function versionCommits() {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const bumps = git('log', '--format=%H', '-G', 'ENGINE_VERSION = [0-9]+', '--', 'engine/Engine.ts').trim().split('\n');
  const versionAt = (c) => Number(/ENGINE_VERSION = (\d+)/.exec(git('show', `${c}:engine/Engine.ts`))[1]);
  const map = new Map();
  bumps.forEach((c, i) => map.set(versionAt(c), i === 0 ? null : `${bumps[i - 1]}^`));
  return { map, git };
}

const cache = join(tmpdir(), 'hk-engines');
const work = mkdtempSync(join(tmpdir(), 'hk-replays-'));
const bundles = new Map();
let commits;

/** The analyzer bundled with the engine of version `v`. */
async function analyzerFor(v) {
  if (bundles.has(v)) return bundles.get(v);
  commits ??= versionCommits();
  if (!commits.map.has(v)) throw new Error(`no commit has ENGINE_VERSION ${v}`);
  const commit = commits.map.get(v);
  let engineDir = join(ROOT, 'engine');
  if (commit) {
    const dir = join(cache, `e${v}`);
    if (!existsSync(join(dir, 'engine', 'index.ts'))) {
      mkdirSync(dir, { recursive: true });
      execFileSync('sh', ['-c', `git archive ${commit} engine | tar -x -C "${dir.replace(/\\/g, '/')}"`], { cwd: ROOT });
    }
    engineDir = join(dir, 'engine');
  }
  const out = join(work, `analyze${v}.mjs`);
  const engineIndex = join(engineDir, 'index.ts');
  await build({
    stdin: {
      contents: `export { replayEngine, hashState, ENGINE_VERSION } from '@hk/engine';
        export { analyzeRun } from './server/src/replayStats.ts';
        export { formatPicks, formatRun, formatTable } from './server/src/replayReport.ts';`,
      resolveDir: ROOT, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
    plugins: [{ name: 'engine', setup: (b) => b.onResolve({ filter: /^@hk\/engine$/ }, () => ({ path: engineIndex })) }],
  });
  const mod = await import(pathToFileURL(out).href);
  if (mod.ENGINE_VERSION !== v) throw new Error(`engine for ${v} says ${mod.ENGINE_VERSION}`);
  bundles.set(v, mod);
  return mod;
}

const reports = [];
for (const f of files) {
  const doc = JSON.parse(readFileSync(f, 'utf8'));
  reports.push(doc.replay !== undefined ? { id: doc.id ?? f, ...doc } : { id: f, replay: doc, text: '' });
}
if (fetchArg) reports.push(...(await fetchReports(Number(fetchArg.split('=')[1] ?? 20))));
if (collectedArg) reports.push(...(await fetchCollected(Number(collectedArg.split('=')[1] ?? 100))));

// a run reported twice: the later report covers the earlier one (a collected run is one already)
const runOf = (rep) => rep.run ?? `seed${rep.replay.config.seed}`;
const longest = new Map();
for (const rep of reports) {
  const r = rep.replay;
  if (r?.tick > 0 && r.tick > (longest.get(runOf(rep)) ?? 0)) longest.set(runOf(rep), r.tick);
}
const rows = [];
let mod;
for (const rep of reports) {
  const r = rep.replay;
  if (!r || r.tick === 0) continue;
  mod = await analyzerFor(r.engine);
  const engine = mod.replayEngine(r);
  const stats = mod.analyzeRun(engine, r.tick);
  const c = r.config;
  const m = {
    id: String(rep.id).slice(0, 16), tags: [rep.host, rep.game, rep.locale, rep.end].filter(Boolean), chapter: c.chapter ?? 1, relic: c.relic ?? '?',
    monk: c.monk ?? 'kicker', engine: r.engine, hashOk: mod.hashState(engine.state) === r.hash, note: rep.text ?? '',
    earlier: r.tick < longest.get(runOf(rep)),
  };
  rows.push({ m, r: stats });
  console.log(mod.formatRun(m, stats).join('\n') + '\n');
}
if (mod) console.log([...mod.formatTable(rows), '', ...mod.formatPicks(rows)].join('\n'));
if (jsonArg) writeFileSync(jsonArg.slice('--json='.length), JSON.stringify(rows, null, 1));
rmSync(work, { recursive: true, force: true });
