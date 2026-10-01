import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Prints the balance report: bots play whole chapters over many seeds (engine/bot/balance.ts).
// Usage: npm run balance [-- runs [style ...]]   e.g. npm run balance -- 20 casual
const [runs = '10', ...styles] = process.argv.slice(2);

const dir = mkdtempSync(join(tmpdir(), 'hk-balance-'));
const out = join(dir, 'balance.mjs');
try {
  await build({ entryPoints: ['engine/bot/balance.ts'], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
  const { balanceReport } = await import(pathToFileURL(out).href);
  const started = Date.now();
  for (const line of balanceReport(Number(runs), styles.length ? styles : undefined)) console.log(line);
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
