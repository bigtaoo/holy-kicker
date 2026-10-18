import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';
import { openBeacon } from './vite.crazygames.config.js';

// The Newgrounds build: `npm run build:newgrounds` writes client/dist-newgrounds/, the folder to
// zip (forward-slash paths, index.html at the root) and upload as a Games submission. Newgrounds
// has no SDK we need, so next to the web build it only differs in:
//  1. base './': the upload is served from uploads.ungrounded.net under a path of its choosing;
//  2. the entry is src/main.newgrounds.ts (the browser host, reporting as `newgrounds`);
//  3. the inline `open_*` / `quit_*` load checkpoint of the CrazyGames build, tagged newgrounds.
// The build fails if the HTML was never rewritten.

const API = (process.env.VITE_HK_API || 'https://hk.gamestao.com').replace(/\/+$/, '');
const DEFAULT_ENTRY = '/src/main.ts';
const PORTAL_ENTRY = '/src/main.newgrounds.ts';

const newgroundsHtml = () => {
  let applied = false;
  let beacon = '';
  const apply = (html) => {
    let out = html;
    if (out.includes(DEFAULT_ENTRY)) out = out.replace(DEFAULT_ENTRY, PORTAL_ENTRY);
    if (beacon && !out.includes('/v1/beacon')) out = out.replace('<script type="module"', `${beacon}\n    <script type="module"`);
    if (out.includes(PORTAL_ENTRY)) applied = true;
    return out;
  };
  return {
    name: 'newgrounds-html',
    enforce: 'pre',
    configResolved(config) {
      if (config.command === 'build') beacon = openBeacon(API, JSON.parse(buildDefine().__HK_BUILD__), 'newgrounds');
    },
    transform(code, id) {
      return id.endsWith('.html') ? apply(code) : null;
    },
    transformIndexHtml: apply,
    closeBundle() {
      if (!applied) throw new Error('vite.newgrounds.config.js: index.html was never rewritten for Newgrounds');
    },
  };
};

export default defineConfig({
  base: './',
  resolve: { alias: engineAlias },
  define: buildDefine(),
  plugins: [newgroundsHtml()],
  server: { port: 5177, host: true },
  build: { target: 'es2020', outDir: 'dist-newgrounds', emptyOutDir: true },
});
