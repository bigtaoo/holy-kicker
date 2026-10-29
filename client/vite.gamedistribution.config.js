import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';
import { themeAssets } from '../build/theme.mjs';
import { preloadRenderer } from '../build/preloadRenderer.mjs';

// The GameDistribution build: `npm run build:gamedistribution` writes client/dist-gamedistribution/,
// the folder to zip and upload (index.html at the archive's root). Like the Playgama build
// (vite.playgama.config.js), with base './' and its own entry, src/main.gamedistribution.ts, which
// adds GD's SDK script itself (the SDK wants its options on the window first). GameDistribution
// forbids any network but its own, so the backend's address is left out of the bundle
// (`__HK_API__` empty; the host is offline in apiBase too), and the build fails if it shows up.
// The corgi reskin builds the same way into client/dist-gamedistribution-new/
// (vite.gamedistribution.new.config.js), a game of its own in GD's console.

const DEFAULT_ENTRY = '/src/main.ts';
const PORTAL_ENTRY = '/src/main.gamedistribution.ts';
/** The backend's domain, which no GameDistribution bundle may name. */
const BACKEND = 'gamestao.com';

const gamedistribution = () => {
  let applied = false;
  const apply = (html) => {
    const out = html.replace(DEFAULT_ENTRY, PORTAL_ENTRY);
    if (out.includes(PORTAL_ENTRY)) applied = true;
    return out;
  };
  return {
    name: 'gamedistribution-html',
    enforce: 'pre',
    transform(code, id) {
      return id.endsWith('.html') ? apply(code) : null;
    },
    transformIndexHtml: apply,
    generateBundle(_opts, bundle) {
      for (const [name, file] of Object.entries(bundle)) {
        const text = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : '';
        if (text.includes(BACKEND)) this.error(`vite.gamedistribution.config.js: ${name} names ${BACKEND}`);
      }
    },
    closeBundle() {
      if (!applied) throw new Error('vite.gamedistribution.config.js: index.html was never rewritten for GameDistribution');
    },
  };
};

export function gamedistributionConfig(theme) {
  const monk = theme === 'monk';
  return defineConfig({
    base: './',
    resolve: { alias: engineAlias },
    define: { ...buildDefine(theme), __HK_API__: JSON.stringify('') },
    plugins: [gamedistribution(), themeAssets(theme), preloadRenderer()],
    server: { port: monk ? 5177 : 5187, host: true },
    build: { target: 'es2020', outDir: monk ? 'dist-gamedistribution' : 'dist-gamedistribution-new', emptyOutDir: true },
  });
}

export default gamedistributionConfig('monk');
