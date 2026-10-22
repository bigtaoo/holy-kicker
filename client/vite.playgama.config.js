import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';
import { preloadRenderer } from '../build/preloadRenderer.mjs';

// The Playgama build: `npm run build:playgama` writes client/dist-playgama/, the folder to zip and
// upload (index.html at the archive's root). Like the CrazyGames build (vite.crazygames.config.js):
//  1. base './': the portal serves the upload from a path of its choosing;
//  2. the entry is src/main.playgama.ts instead of src/main.ts;
//  3. the Bridge SDK <script> (Playgama's CDN, its current stable v2) goes ahead of the entry, in
//     <body> after the HTML loading screen, so the screen paints while the tag downloads;
//  4. playgama-bridge-config.json sits next to index.html, where Bridge reads it from.
// The build fails if the HTML was never rewritten, rather than ship a game without the SDK
// (Playgama refuses such a build).

const SDK_TAG = '<script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js"></script>';
const DEFAULT_ENTRY = '/src/main.ts';
const PORTAL_ENTRY = '/src/main.playgama.ts';

/** Interstitials no closer than a minute apart (Bridge's own default, made explicit). */
const BRIDGE_CONFIG = { advertisement: { minimumDelayBetweenInterstitial: 60 } };

export function rewritePlaygamaHtml(html) {
  let out = html;
  if (out.includes(DEFAULT_ENTRY)) out = out.replace(DEFAULT_ENTRY, PORTAL_ENTRY);
  if (!out.includes('bridge.playgama.com')) out = out.replace('<script type="module"', `${SDK_TAG}\n    <script type="module"`);
  return out;
}

const playgama = () => {
  let applied = false;
  const apply = (html) => {
    const out = rewritePlaygamaHtml(html);
    if (out.includes(PORTAL_ENTRY) && out.includes('bridge.playgama.com')) applied = true;
    return out;
  };
  return {
    name: 'playgama-html',
    enforce: 'pre',
    transform(code, id) {
      return id.endsWith('.html') ? apply(code) : null;
    },
    transformIndexHtml: apply,
    configureServer(server) {
      server.middlewares.use('/playgama-bridge-config.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(BRIDGE_CONFIG));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: JSON.stringify(BRIDGE_CONFIG, null, 2) });
    },
    closeBundle() {
      if (!applied) throw new Error('vite.playgama.config.js: index.html was never rewritten for Playgama');
    },
  };
};

export default defineConfig({
  base: './',
  resolve: { alias: engineAlias },
  define: buildDefine(),
  plugins: [playgama(), preloadRenderer()],
  server: { port: 5176, host: true },
  build: { target: 'es2020', outDir: 'dist-playgama', emptyOutDir: true },
});
