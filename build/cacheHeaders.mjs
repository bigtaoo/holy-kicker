import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Cloudflare serves every static file with `max-age=0, must-revalidate`, so a repeat visit asks
// again for each script before it may run it: a round trip apiece, seconds on a slow tablet or
// phone network. Vite's assets/ files are named by their content hash and never change, so a
// `_headers` file (Cloudflare's static-asset headers) lets the browser keep them a year without
// asking. index.html and the art, whose names do not change with their content, keep the default.
// Written to the root of the deployed directory: client/dist, or client/dist-new for the corgi
// build under /new/ (wrangler/web.jsonc, wrangler/new.jsonc). Web hosts only.

export function cacheHeaders() {
  let base = '/';
  let outDir = '';
  return {
    name: 'hk-cache-headers',
    apply: 'build',
    configResolved(config) {
      base = config.base;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      // the deployed root sits above outDir by as many folders as the base has (dist-new/new)
      const depth = base.split('/').filter(Boolean).length;
      const root = resolve(outDir, ...Array(depth).fill('..'));
      writeFileSync(join(root, '_headers'), `${base}assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
    },
  };
}
