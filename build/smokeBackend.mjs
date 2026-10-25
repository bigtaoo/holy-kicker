// The smoke's backend (build/smoke.mjs): the server's own router (server/src/routes.ts) on an
// in-memory store, answering the page's calls to hk.gamestao.com through Playwright's routing, so
// a release build talks to the real rules without the network. The server's TypeScript is bundled
// in memory with esbuild (as server/build.mjs does, current engine only) and imported once.
// Every POST is kept with what the server's checkers (rules.ts) say of its body, and the runs the
// server takes are re-simulated (resimQueue.ts): `problems()` lists each refused body, each run
// the re-simulation refused, each run that ended ranked (its run_end event) but was never posted,
// and each challenge run that never reached /v1/challenge/runs. A run whose own clock is under the
// server's time for its wave is not ranked (runEnd.ts plausible): on a slow CI runner the run's
// clock falls well behind the wall's, so a 12 s fight can end a wave-1 run under 4 s.
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SERVER_SRC = fileURLToPath(new URL('../server/src/', import.meta.url));
/** A chapter run of this many waves is ranked (runFlow.ts settle). */
const RANKED_WAVES = JSON.parse(readFileSync(new URL('../client/src/meta/balance.json', import.meta.url), 'utf8')).waves;

const ENTRY = `
export { route } from './routes';
export { MemoryStore } from './store';
export { ResimQueue } from './resimQueue';
export { MemoryVault } from './cloudVault';
export { MemoryShelf } from './replayShelf';
export { engineFor } from './engines';
export { checkBatch, checkRunPost, checkChallengeRun } from './rules';
export { LIMITS } from './protocol';
`;

let server = null;

/** The bundled server modules, built on first use. */
function serverModules() {
  server ??= (async () => {
    const out = await build({
      stdin: { contents: ENTRY, resolveDir: SERVER_SRC, sourcefile: 'smoke-entry.ts', loader: 'ts' },
      bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false,
      loader: { '.html': 'text' }, logLevel: 'error',
      tsconfig: join(SERVER_SRC, '..', 'tsconfig.json'),
      plugins: [{ name: 'memory-only', setup: (b) => {
        b.onLoad({ filter: /[\\/]src[\\/]oldEngines\.ts$/ }, () => ({ contents: 'export const OLD_ENGINES = {};', loader: 'js' }));
        // the in-memory store never opens Mongo: an empty stand-in keeps the driver out of the bundle
        b.onResolve({ filter: /^mongodb$/ }, () => ({ path: 'mongodb', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = new Proxy({}, { get: () => class {} });', loader: 'js' }));
      } }],
    });
    const file = join(mkdtempSync(join(tmpdir(), 'hk-smoke-')), 'server.mjs');
    writeFileSync(file, out.outputFiles[0].text);
    return import(pathToFileURL(file).href);
  })();
  return server;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-hk-install, authorization',
};

/** Which checker judges a POST to `path`, if any. */
function checker(m, path) {
  if (path === '/v1/events') return (b) => m.checkBatch(b, Date.now());
  if (path === '/v1/runs') return m.checkRunPost;
  if (path === '/v1/challenge/runs') return m.checkChallengeRun;
  return null;
}

/** A fresh backend for one build: `handle(route)` answers a Playwright route, `problems()` judges what came. */
export async function backend() {
  const m = await serverModules();
  const store = new m.MemoryStore();
  const refusedResims = [];
  const resim = new m.ResimQueue(store, m.engineFor, Date.now, (line) => { if (/refused|failed/.test(line)) refusedResims.push(line); });
  const deps = {
    store, tagSalt: 'smoke', adminKey: '', now: Date.now, allow: () => true, resim, replays: new m.MemoryShelf(),
    cloud: { vault: new m.MemoryVault(), gcKey: async () => null },
  };
  /** Every POST: its path, body, the checker's reason when it refused, and the reply's status. */
  const posts = [];

  async function handle(r) {
    const req = r.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    let body;
    try {
      body = req.method() === 'POST' ? req.postDataJSON() : undefined;
    } catch {
      body = undefined;
    }
    const headers = await req.allHeaders();
    const reply = await m.route({ method: req.method(), path: url.pathname, query: url.searchParams, headers, body, ip: '127.0.0.1' }, deps);
    if (req.method() === 'POST') {
      const check = checker(m, url.pathname)?.(body);
      posts.push({ path: url.pathname, body, refused: check && !check.ok ? check.reason : null, status: reply.status });
    }
    if (reply.body === undefined) return r.fulfill({ status: reply.status, headers: CORS, body: '' });
    return r.fulfill({ status: reply.status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(reply.body) });
  }

  /** The run_end events the page posted. */
  const runEnds = () => posts.filter((p) => p.path === '/v1/events' && !p.refused).flatMap((p) => p.body.events.filter((e) => e.e === 'run_end').map((e) => e.p ?? {}));

  /** What went wrong, once the page is done; `guest`: the host has no board name (a portal guest), so ranked runs are not posted. */
  async function problems({ guest = false } = {}) {
    await resim.idle();
    const out = [];
    for (const p of posts) {
      if (p.refused) out.push(`POST ${p.path} refused by the server's checker: ${p.refused}`);
      else if (p.status >= 400) out.push(`POST ${p.path} answered ${p.status}`);
    }
    out.push(...refusedResims.map((l) => `re-simulation: ${l}`));
    const ends = runEnds();
    const runs = posts.filter((p) => p.path === '/v1/runs' && p.status < 400).length;
    const challengeRuns = posts.filter((p) => p.path === '/v1/challenge/runs' && p.status < 400).length;
    // the server takes a run's time only from its wave's minimum on (rules.ts checkRun); the client sends no other run
    const timed = (p) => p.tenths >= p.wave * m.LIMITS.minSecondsPerWave * 10;
    const ranked = ends.filter((p) => !p.challenge && p.waves === RANKED_WAVES && timed(p)).length;
    const challenged = ends.filter((p) => p.challenge && timed(p)).length;
    if (!guest && runs < ranked) out.push(`${ranked} ranked run(s) ended but ${runs} reached /v1/runs`);
    if (!guest && challengeRuns < challenged) out.push(`${challenged} challenge run(s) ended but ${challengeRuns} reached /v1/challenge/runs`);
    return out;
  }

  return { handle, posts, runEnds, problems };
}
