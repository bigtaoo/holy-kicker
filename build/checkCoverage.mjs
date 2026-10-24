// The coverage ratchet: compares the line coverage `npm run coverage` just wrote (coverage/<ws>/
// coverage-summary.json) with the floors in build/coverage-floors.json, per workspace and per
// directory of client/src. Fails when one drops more than SLACK points below its floor.
// `--update` raises every floor to the current value and never lowers one; run it after adding
// tests (`npm run coverage -- --update`) and commit the floors.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLACK = 0.5;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FLOORS = join(ROOT, 'build/coverage-floors.json');
const WORKSPACES = ['engine', 'server', 'client'];
const CLIENT_DIRS = ['meta', 'net', 'platform', 'game', 'ui', 'audio'];

/** Line coverage in percent with two decimals, 100 for an empty set. */
const pct = (covered, total) => (total ? Math.floor((covered / total) * 10000) / 100 : 100);

function summary(ws) {
  const file = join(ROOT, 'coverage', ws, 'coverage-summary.json');
  if (!existsSync(file)) {
    console.error(`${relative(ROOT, file)} is missing: run \`npm run coverage\` first`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The current line coverage of every measured area, keyed as in the floors file. */
function measure() {
  const now = {};
  for (const ws of WORKSPACES) {
    const s = summary(ws);
    now[ws] = pct(s.total.lines.covered, s.total.lines.total);
    if (ws !== 'client') continue;
    const src = join(ROOT, 'client', 'src');
    for (const dir of CLIENT_DIRS) {
      let covered = 0;
      let total = 0;
      for (const [path, entry] of Object.entries(s)) {
        if (path === 'total' || relative(src, path).split(sep)[0] !== dir) continue;
        covered += entry.lines.covered;
        total += entry.lines.total;
      }
      now[`client/${dir}`] = pct(covered, total);
    }
  }
  return now;
}

const now = measure();
const floors = existsSync(FLOORS) ? JSON.parse(readFileSync(FLOORS, 'utf8')) : {};

if (process.argv.includes('--update')) {
  const next = {};
  for (const [key, value] of Object.entries(now)) next[key] = Math.max(value, floors[key] ?? 0);
  writeFileSync(FLOORS, JSON.stringify(next, null, 2) + '\n');
  for (const key of Object.keys(next)) {
    const was = floors[key];
    const note = was === undefined ? 'new' : next[key] > was ? `was ${was}` : 'unchanged';
    console.log(`  ${key.padEnd(16)} ${String(next[key]).padStart(6)} %  (${note})`);
  }
  console.log(`coverage floors written to ${relative(ROOT, FLOORS)}`);
  process.exit(0);
}

const drops = [];
for (const [key, floor] of Object.entries(floors)) {
  const value = now[key];
  const line = `  ${key.padEnd(16)} ${String(value).padStart(6)} %  (floor ${floor})`;
  if (value < floor - SLACK) drops.push(line);
  else console.log(line);
}
if (drops.length) {
  console.error(`Line coverage fell more than ${SLACK} points below its floor:\n${drops.join('\n')}`);
  console.error('Add tests for the new code, or see build/checkCoverage.mjs if a floor is wrong.');
  process.exit(1);
}
const missing = Object.keys(now).filter((k) => !(k in floors));
if (missing.length) console.log(`no floor yet for ${missing.join(', ')}: npm run coverage -- --update`);
console.log(`coverage ok (no area more than ${SLACK} points below build/coverage-floors.json)`);
