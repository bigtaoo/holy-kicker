// Fails if the built WeChat main package (client/wechat) is over 4 MB.
// Run after `npm run build:wechat`. Subpackages will get their own budget once they exist.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 4 * 1024 * 1024;
const PKG = fileURLToPath(new URL('../client/wechat', import.meta.url));
// DevTools project files are not uploaded as part of the package.
const IGNORE = new Set(['project.config.json', 'project.private.config.json']);

if (!existsSync(join(PKG, 'js', 'game.js'))) {
  console.error('client/wechat/js/game.js is missing; run `npm run build:wechat` first');
  process.exit(1);
}

function size(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    total += s.isDirectory() ? size(p) : s.size;
  }
  return total;
}

const bytes = size(PKG);
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
if (bytes > LIMIT) {
  console.error(`WeChat main package is ${mb(bytes)}, over the ${mb(LIMIT)} limit`);
  process.exit(1);
}
console.log(`WeChat main package ${mb(bytes)} / ${mb(LIMIT)}`);
