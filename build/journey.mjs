import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Prints a whole player journey through the meta game (client/src/meta/journey.ts): bots play
// every run with the stats their save gives them, and the lobby is used between runs.
// Usage: npm run journey [-- style] [runs=N] [days=N] [stars=N] [ads|noads] [nolobby] [seed=N]   e.g. npm run journey -- casual runs=3 noads
// stars=N: runs a session replays a cleared chapter short of three stars (default 1).
const args = process.argv.slice(2);
const num = (key, fallback) => Number(args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback);
const plan = {
  style: args.find((a) => !a.includes('=') && !['ads', 'noads', 'nolobby'].includes(a)) ?? 'casual',
  runsPerSession: num('runs', 2),
  ads: !args.includes('noads'),
  days: num('days', 30),
  seed: num('seed', 1),
  lobby: !args.includes('nolobby'),
  stars: num('stars', 1),
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
  const { clears, threeStars } = journey(plan, (line) => console.log(line));
  for (const c of clears) {
    console.log(`== ch${c.chapter}: day ${c.day}, run ${c.runs}, ${c.stars} stars, trained ${c.trained}\n   ${c.bonus}\n   ${c.gear}`);
  }
  // one line a chapter: tries to the first clear and its stars, then replays and the day to three stars
  console.log('chapter | tries | stars | 3 stars: replays, day');
  for (const c of clears) {
    const three = c.stars >= 3 ? { tries: [], day: c.day } : threeStars.find((t) => t.chapter === c.chapter);
    const at = three ? `${three.tries.length}, day ${three.day}` : '-';
    console.log(`ch${String(c.chapter).padStart(2)} | ${String(c.tries.length).padStart(5)} | ${String(c.stars).padStart(5)} | ${at}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
