// Fails if a built WeChat package (client/wechat) is over its limit: the main package and
// each chapter subpackage (art/ch<n>, declared in game.json by vite.wechat.config.js) at
// 4 MB, the whole game at 30 MB. Run after `npm run build:wechat`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 4 * 1024 * 1024;
const TOTAL_LIMIT = 30 * 1024 * 1024;
const PKG = fileURLToPath(new URL('../client/wechat', import.meta.url));
// DevTools project files are not uploaded as part of the package.
const IGNORE = new Set(['project.config.json', 'project.private.config.json']);

if (!existsSync(join(PKG, 'js', 'game.js'))) {
  console.error('client/wechat/js/game.js is missing; run `npm run build:wechat` first');
  process.exit(1);
}

const game = JSON.parse(readFileSync(join(PKG, 'game.json'), 'utf8'));
const subs = (game.subpackages ?? []).map((p) => ({ name: p.name, dir: resolve(PKG, p.root) }));

function size(dir, skip = new Set()) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (IGNORE.has(name) || skip.has(p)) continue;
    const s = statSync(p);
    total += s.isDirectory() ? size(p, skip) : s.size;
  }
  return total;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const packs = [{ name: 'main', bytes: size(PKG, new Set(subs.map((p) => p.dir))) }];
for (const p of subs) {
  if (!existsSync(join(p.dir, 'game.js'))) {
    console.error(`WeChat subpackage ${p.name} has no game.js at its root`);
    process.exit(1);
  }
  packs.push({ name: p.name, bytes: size(p.dir) });
}
let failed = false;
let total = 0;
for (const p of packs) {
  total += p.bytes;
  const over = p.bytes > LIMIT;
  failed ||= over;
  console[over ? 'error' : 'log'](`WeChat package ${p.name} ${mb(p.bytes)} / ${mb(LIMIT)}${over ? ' OVER' : ''}`);
}
if (total > TOTAL_LIMIT) {
  failed = true;
  console.error(`WeChat game ${mb(total)}, over the ${mb(TOTAL_LIMIT)} limit`);
}
if (failed) process.exit(1);
