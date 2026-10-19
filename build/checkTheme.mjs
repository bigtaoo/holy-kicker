// Keeps each theme's asset list (build/theme.mjs) in step with client/public: fails on a file of
// client/public the list lacks, an entry for a file the game does not have, a source that is not
// there, or a drawn sheet whose WebP twin is another size. Entries still null only count: the
// theme's own build is what refuses them. `-- --sync` adds the missing files as null and drops the
// unknown entries, keeping the rest.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageSize } from './imageSize.mjs';
import { listErrors, listPath, listState, publicFiles, readList, ROOT, THEMES } from './theme.mjs';

const sync = process.argv.includes('--sync');
const webp = JSON.parse(readFileSync(new URL('../client/src/webpArt.json', import.meta.url), 'utf8'));
const files = publicFiles();
let bad = 0;

for (const name of Object.keys(THEMES).filter((n) => THEMES[n].list)) {
  let list = readList(name);
  if (sync) {
    list = Object.fromEntries(files.map((f) => [f, list[f] ?? null]));
    writeFileSync(listPath(name), `${JSON.stringify(list, null, 2)}\n`);
  }
  const state = listState(list, files);
  const errors = listErrors({ ...state, todo: [] });
  for (const png of webp) {
    const twin = png.replace(/\.png$/, '.webp');
    if (!list[png] || !list[twin] || state.gone.includes(png) || state.gone.includes(twin)) continue;
    const [p, w] = [list[png], list[twin]].map((src) => imageSize(readFileSync(join(ROOT, src))));
    if (p !== w) errors.push(`${png}: PNG ${p}, WebP ${w} (python tools/webp.py on the corgi's sheet)`);
  }
  if (errors.length) {
    console.error(`theme ${name}: ${THEMES[name].list}\n${errors.join('\n')}`);
    bad++;
  }
  const drawn = files.length - state.todo.length - state.unlisted.length;
  console.log(`theme ${name}: ${drawn}/${files.length} files drawn${state.todo.length ? `, ${state.todo.length} to go (its build waits for them)` : ''}`);
}
if (bad) process.exit(1);
