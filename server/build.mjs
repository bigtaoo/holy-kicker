// Bundles the server into one ESM file, dist/server.mjs, for the Docker image (deploy/).
// mongodb stays external: the image installs it from deploy/package.json.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/server.mjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['mongodb'],
  // the /dash page goes into the bundle as a string
  loader: { '.html': 'text' },
  logLevel: 'info',
});
