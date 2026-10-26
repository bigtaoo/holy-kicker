import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';
import { themeAssets } from '../build/theme.mjs';
import { preloadRenderer } from '../build/preloadRenderer.mjs';
import { cacheHeaders } from '../build/cacheHeaders.mjs';
import { coverage, TEST_TIMEOUT } from '../build/coverage.mjs';

/**
 * The web build of one art set (build/theme.mjs). Monk: `npm run build` → client/dist, served at
 * h.gamestao.com. Corgi: `npm run build:new` (vite.new.config.js) → client/dist-new/new/, served
 * at h.gamestao.com/new/ (wrangler/new.jsonc), its art from client/themes/corgi.json only.
 */
export function webConfig(theme) {
  const monk = theme === 'monk';
  return defineConfig(({ command }) => ({
    base: monk || command !== 'build' ? '/' : '/new/',
    // @hk/engine: the deterministic sim, a sibling package at the repo root (build/hkAlias.mjs)
    resolve: { alias: engineAlias },
    define: buildDefine(theme),
    plugins: [themeAssets(theme), preloadRenderer(), cacheHeaders()],
    server: {
      port: monk ? 5174 : 5184,
      host: true,
      // Build outputs inside the root: `build:wechat` deletes and rewrites client/wechat/art, and on
      // Windows a watch on a deleted folder spins the dev server at full CPU until it restarts.
      watch: { ignored: ['**/wechat/**', '**/dist*/**', '**/ios/**'] },
    },
    build: { target: 'es2020', outDir: monk ? 'dist' : 'dist-new/new', emptyOutDir: true },
    // the same dice and day for every test (src/testkit/seedRandom.ts); build/coverage.mjs on the timeout
    test: { setupFiles: ['src/testkit/seedRandom.ts'], testTimeout: TEST_TIMEOUT, coverage: coverage('client', ['src/**/*.ts']) },
  }));
}

export default webConfig('monk');
