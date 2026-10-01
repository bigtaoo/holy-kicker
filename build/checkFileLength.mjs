// Fails if any source file is over MAX_LINES. Split long files instead of raising the limit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 500;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['client/src', 'engine', 'build', 'tools'];
const EXTS = ['.ts', '.mjs', '.js', '.py', '.sh'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXTS.some((e) => name.endsWith(e))) yield p;
  }
}

const offenders = [];
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    if (lines > MAX_LINES) offenders.push(`${relative(ROOT, file)}: ${lines} lines`);
  }
}

if (offenders.length) {
  console.error(`Files over ${MAX_LINES} lines:\n  ${offenders.join('\n  ')}`);
  process.exit(1);
}
console.log(`file length ok (<= ${MAX_LINES} lines)`);
