// Release builds read no dev URL switch (CLAUDE.md "Dev URL switches"): ?wave=, ?sutras, ?relic=,
// ?api= and the rest work under `import.meta.env.DEV` only, or a link could hand a player a
// boosted ranked run or send their install id elsewhere. The guard is the built bundle, not the
// source: in a release Vite folds `import.meta.env.DEV` to false and drops what it guarded, so
// whatever reads a switch and is still in the bundle is read by players, however it got there.
// The switch names come from the source itself: every `.get('x')` / `.has('x')` in a client file
// that handles URLSearchParams (game/scene.ts parseScene, net/backend.ts apiBase, the web
// platform's fakes, ...), so a new switch is covered the day it is added.
//   node build/releaseSwitches.mjs       the dists `npm run check` builds (CrazyGames, Playgama, iOS, WeChat)
// build/smoke.mjs runs the same check on every dist it plays (web and corgi too).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = fileURLToPath(new URL('../client/', import.meta.url));
const SRC = join(CLIENT, 'src');

function files(dir, keep) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, keep) : keep(p) ? [p] : [];
  });
}

/** Every URL switch a development build reads. */
export function switchNames() {
  const names = new Set();
  const sources = files(SRC, (p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes(`${join(SRC, 'testkit')}`));
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('URLSearchParams')) continue;
    for (const m of text.matchAll(/\.(?:get|has)\('(\w+)'\)/g)) names.add(m[1]);
  }
  return names;
}

/** The switch reads left in a built dist's scripts, as `file: .get("wave")`. */
export function switchReads(dist, names = switchNames()) {
  const found = [];
  for (const file of files(dist, (p) => p.endsWith('.js'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\.(?:get|has)\(["'`](\w+)["'`]\)/g)) {
      if (names.has(m[1])) found.push(`${relative(CLIENT, file).replaceAll('\\', '/')}: ${m[0]}`);
    }
  }
  return [...new Set(found)];
}

const CHECKED = ['dist-crazygames', 'dist-playgama', 'dist-gamedistribution', 'dist-ios', 'wechat/js'];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = switchNames();
  // parseScene's own switches must be found, or the source scan has gone blind
  for (const n of ['wave', 'sutras', 'relic', 'api', 'direct', 'ads']) {
    if (!names.has(n)) throw new Error(`releaseSwitches: the switch ?${n} was not found in client/src; fix the scan`);
  }
  let failed = 0;
  for (const dir of CHECKED) {
    const dist = join(CLIENT, dir);
    if (!existsSync(dist)) {
      console.error(`client/${dir} is missing; build it first`);
      failed++;
      continue;
    }
    const reads = switchReads(dist, names);
    for (const r of reads) console.error(`a release reads a dev switch: client/${r}`);
    if (reads.length) failed++;
  }
  if (failed) {
    console.error('Gate the read on import.meta.env.DEV (as main.ts does parseScene), or rename a lookup that only looks like one.');
    process.exit(1);
  }
  console.log(`releaseSwitches: ${names.size} dev switches, none read by ${CHECKED.join(', ')}`);
}
