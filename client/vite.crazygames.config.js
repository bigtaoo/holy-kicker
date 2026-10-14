import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';

// The CrazyGames build: `npm run build:crazygames` writes client/dist-crazygames/, the folder
// to zip and upload. Adapted from D:\daydayup\client\vite.crazygames.config.js. It differs
// from the web build in three ways, each a platform requirement:
//  1. base './': the portal serves the upload from a path of its choosing, so every path must
//     be relative (our art paths already are).
//  2. the entry is src/main.crazygames.ts instead of src/main.ts;
//  3. the SDK <script> goes into <head>, ahead of the entry (CrazyGamesSdk.init polls for it).
// A build also gets the `open_*` load checkpoint (server/src/protocol.ts BEACONS) as an inline
// script ahead of the SDK tag, which is synchronous: a tick after it would miss every launch given
// up while the SDK itself downloads. The game sends `loaded_*` once its first screen is up
// (Backend.beacon), with the same desktop/touch test, so loaded / opened is the share past loading.
// (2) and (3) rewrite index.html on two hooks, because Vite's build reaches the HTML through
// `transform` (before vite:build-html swaps the entry) and dev through `transformIndexHtml`.
// The build fails if neither ran, rather than shipping a game without the integration.

const SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';
const API = (process.env.VITE_HK_API || 'https://hk.gamestao.com').replace(/\/+$/, '');

/** The inline `open_*` checkpoint: no id, no storage, nothing from a developer's own machine. */
export function openBeacon(api, build) {
  return `<script>(function(){try{var h=location.hostname;if(h==='localhost'||h==='[::1]'||h.indexOf('127.')===0)return;var t=matchMedia('(pointer: coarse)').matches?'touch':'desktop';fetch('${api}/v1/beacon?h=crazygames&s=open_'+t+'&b='+encodeURIComponent(${JSON.stringify(build)}),{mode:'no-cors',keepalive:true}).catch(function(){})}catch(e){}})()</script>`;
}

const DEFAULT_ENTRY = '/src/main.ts';
const PORTAL_ENTRY = '/src/main.crazygames.ts';

export function rewritePortalHtml(html, beacon = '') {
  let out = html;
  if (out.includes(DEFAULT_ENTRY)) out = out.replace(DEFAULT_ENTRY, PORTAL_ENTRY);
  if (!out.includes('sdk.crazygames.com')) out = out.replace('</head>', `    ${beacon}${beacon ? '\n    ' : ''}${SDK_TAG}\n  </head>`);
  return out;
}

const portalHtml = () => {
  let applied = false;
  let beacon = '';
  const apply = (html) => {
    const out = rewritePortalHtml(html, beacon);
    if (out.includes(PORTAL_ENTRY) && out.includes('sdk.crazygames.com')) applied = true;
    return out;
  };
  return {
    name: 'crazygames-html',
    enforce: 'pre',
    configResolved(config) {
      if (config.command === 'build') beacon = openBeacon(API, JSON.parse(buildDefine().__HK_BUILD__));
    },
    transform(code, id) {
      return id.endsWith('.html') ? apply(code) : null;
    },
    transformIndexHtml: apply,
    closeBundle() {
      if (!applied) throw new Error('vite.crazygames.config.js: index.html was never rewritten for the portal');
    },
  };
};

export default defineConfig({
  base: './',
  resolve: { alias: engineAlias },
  define: buildDefine(),
  plugins: [portalHtml()],
  server: { port: 5175, host: true },
  build: { target: 'es2020', outDir: 'dist-crazygames', emptyOutDir: true },
});
