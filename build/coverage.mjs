// The vitest coverage block shared by the engine, server and client configs: every source .ts,
// without tests, string tables, declarations, entry files and dev tools. `npm run coverage`
// writes each workspace's report to coverage/<name>/, which build/checkCoverage.mjs compares
// with build/coverage-floors.json.
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The time a test may take, for the engine, server and client configs alike. The tests are
 * deterministic and talk to no network, so vitest's 5 s guards no hang; it only measured the
 * machine: whole runs played or re-simulated under coverage take 3 to 4 s on a GitHub runner, and
 * one now and then went past 5 s (the bot's chapter, the server's forged-run re-simulations),
 * failing CI on a commit that changed nothing there. Tests that once had their own longer
 * timeout keep it.
 */
export const TEST_TIMEOUT = 60_000;

/** @param {string} name the workspace (engine, server, client) @param {string[]} include */
export function coverage(name, include) {
  return {
    provider: 'v8',
    include,
    exclude: [
      '**/*.test.ts',
      '**/*.d.ts',
      '**/i18n/**',
      '**/main*.ts',
      '**/src/dev/**',
      '**/node_modules/**',
      '**/vitest.config.ts',
    ],
    reporter: ['text-summary', 'json-summary'],
    reportsDirectory: `${ROOT}coverage/${name}`,
  };
}
