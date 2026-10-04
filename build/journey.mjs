import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Prints a whole player journey through the meta game (client/src/meta/journey.ts): bots play
// every run with the stats their save gives them, and the lobby is used between runs.
// Usage: npm run journey [-- style] [runs=N] [days=N] [ads|noads] [nolobby] [seed=N]   e.g. npm run journey -- casual runs=3 noads
const args = process.argv.slice(2);
const num = (key, fallback) => Number(args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback);
const plan = {
  style: args.find((a) => !a.includes('=') && !['ads', 'noads', 'nolobby'].includes(a)) ?? 'casual',
  runsPerSession: num('runs', 2),
  ads: !args.includes('noads'),
  days: num('days', 30),
  seed: num('seed', 1),
  lobby: !args.includes('nolobby'),
};

const engine = fileURLToPath(new URL('../engine', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'hk-journey-'));
const out = join(dir, 'journey.mjs');
try {
  await build({
    entryPoints: ['client/src/meta/journey.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error',
    alias: { '@hk/engine': engine },
  });
  const { journey } = await import(pathToFileURL(out).href);
  console.log(JSON.stringify(plan));
  for (const c of journey(plan, (line) => console.log(line))) {
    console.log(`== ch${c.chapter}: day ${c.day}, run ${c.runs}, trained ${c.trained}\n   ${c.bonus}\n   ${c.gear}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
