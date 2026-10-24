// The vitest coverage block shared by the engine, server and client configs: every source .ts,
// without tests, string tables, declarations, entry files and dev tools. `npm run coverage`
// writes each workspace's report to coverage/<name>/, which build/checkCoverage.mjs compares
// with build/coverage-floors.json.
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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
