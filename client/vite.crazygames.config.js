import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';
import { themeAssets, themeOf } from '../build/theme.mjs';

// The CrazyGames build: `npm run build:crazygames` writes client/dist-crazygames/, the folder
// to zip and upload. Adapted from D:\daydayup\client\vite.crazygames.config.js. It differs
// from the web build in three ways, each a platform requirement:
//  1. base './': the portal serves the upload from a path of its choosing, so every path must
//     be relative (our art paths already are).
//  2. the entry is src/main.crazygames.ts instead of src/main.ts;
//  3. the SDK <script> goes ahead of the entry (CrazyGamesSdk.init polls for it), in <body> after
//     the HTML loading screen: the tag is synchronous, so in <head> nothing would paint until it came.
// A build also gets the `open_*` load checkpoint (server/src/protocol.ts BEACONS) as an inline
// script ahead of the SDK tag: a tick after it would miss every launch given up while the SDK
// itself downloads. The same script sends `quit_*` with the time since the page opened if the page
// is hidden or left while still loading (the loading screen still up, or not parsed yet). The game
// sends `loaded_*` with its own load time once its first screen is up (Backend.loaded), with the
// same desktop/touch test, so loaded / opened is the share past loading.
// (2) and (3) rewrite index.html on two hooks, because Vite's build reaches the HTML through
// `transform` (before vite:build-html swaps the entry) and dev through `transformIndexHtml`.
// The build fails if neither ran, rather than shipping a game without the integration.
// The corgi reskin builds the same way into client/dist-crazygames-new/ (vite.crazygames.new.config.js),
// with its own art (build/theme.mjs), on the same backend under its own game tag (server/src/game.ts).

const SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';
const api = (theme) => (process.env.VITE_HK_API || themeOf(theme).api).replace(/\/+$/, '');

/**
 * The inline `open_*` and `quit_*` checkpoints: no id, no storage, nothing from a developer's own
 * machine. Loading is over once the body is in and the loading screen (#boot) is gone. A game but
 * the first (the corgi) names itself (`&g=`), so the shared backend counts its loads apart.
 */
export function openBeacon(api, build, host = 'crazygames', game = 'monk') {
  const g = game === 'monk' ? '' : `&g=${game}`;
  return `<script>(function(){try{var h=location.hostname;if(h==='localhost'||h==='[::1]'||h.indexOf('127.')===0)return;var t=matchMedia('(pointer: coarse)').matches?'touch':'desktop';var u='${api}/v1/beacon?h=${host}${g}&b='+encodeURIComponent(${JSON.stringify(build)})+'&s=';var send=function(s){fetch(u+s,{mode:'no-cors',keepalive:true}).catch(function(){})};send('open_'+t);var gone=false;var quit=function(){if(gone||(document.body&&!document.getElementById('boot')))return;gone=true;send('quit_'+t+'&ms='+Math.round(performance.now()))};addEventListener('pagehide',quit);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')quit()})}catch(e){}})()</script>`;
}

const DEFAULT_ENTRY = '/src/main.ts';
const PORTAL_ENTRY = '/src/main.crazygames.ts';

export function rewritePortalHtml(html, beacon = '') {
  let out = html;
  if (out.includes(DEFAULT_ENTRY)) out = out.replace(DEFAULT_ENTRY, PORTAL_ENTRY);
  if (!out.includes('sdk.crazygames.com')) out = out.replace('<script type="module"', `${beacon}${beacon ? '\n    ' : ''}${SDK_TAG}\n    <script type="module"`);
  return out;
}

const portalHtml = (theme) => {
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
      if (config.command === 'build') beacon = openBeacon(api(theme), JSON.parse(buildDefine(theme).__HK_BUILD__), 'crazygames', theme);
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

export function crazygamesConfig(theme) {
  const monk = theme === 'monk';
  return defineConfig({
    base: './',
    resolve: { alias: engineAlias },
    define: buildDefine(theme),
    plugins: [portalHtml(theme), themeAssets(theme)],
    server: { port: monk ? 5175 : 5185, host: true },
    build: { target: 'es2020', outDir: monk ? 'dist-crazygames' : 'dist-crazygames-new', emptyOutDir: true },
  });
}

export default crazygamesConfig('monk');
