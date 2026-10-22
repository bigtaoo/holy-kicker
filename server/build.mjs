// Bundles the server into one ESM file, dist/server.mjs, for the Docker image (deploy/).
// mongodb stays external: the image installs it from deploy/package.json. @hk/engine (the
// re-simulation of challenge and board runs) is bundled from source through tsconfig.base.json's
// paths, and so are the OLD_ENGINES before it, taken from git (build/engines.mjs) in place of the
// empty src/oldEngines.ts: a run recorded on one of them still re-simulates after a deploy. A
// version git lacks (a shallow clone) is left out with a warning, or fails the build when
// HK_OLD_ENGINES_STRICT is set (the deploy job, which fetches the whole history).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { currentVersion, engineDir } from '../build/engines.mjs';

/** How many ENGINE_VERSIONs before the current one the server can still re-simulate. */
const OLD_ENGINE_COUNT = 3;

function oldEngines() {
  const now = currentVersion();
  const lines = [];
  for (let v = now - 1; v >= now - OLD_ENGINE_COUNT && v > 0; v--) {
    let dir = null;
    try {
      dir = engineDir(v);
    } catch (err) {
      console.warn(`engine ${v}: ${err.message}`);
    }
    if (!dir) {
      if (process.env.HK_OLD_ENGINES_STRICT) throw new Error(`engine ${v} is not in git: fetch the whole history`);
      console.warn(`engine ${v} is not in git (a shallow clone?): its runs will be kept aside unchecked`);
      continue;
    }
    lines.push(`  ${v}: () => import(${JSON.stringify(`${dir.replace(/\\/g, '/')}/index.ts`)}),`);
  }
  console.log(`old engines bundled: ${lines.length}/${OLD_ENGINE_COUNT}`);
  return `export const OLD_ENGINES = {\n${lines.join('\n')}\n};\n`;
}

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
  plugins: [{ name: 'old-engines', setup: (b) => b.onLoad({ filter: /[\\/]src[\\/]oldEngines\.ts$/ }, () => ({ contents: oldEngines(), loader: 'js' })) }],
  logLevel: 'info',
});
