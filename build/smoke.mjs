// The release smoke test (CI job `smoke`, before any deploy): each built dist is served as it
// ships and played for SMOKE_SECONDS in headless Chrome (playwright-core), all at once. A fresh
// browser goes straight into the first run (Shell.firstScreen), so a release build needs no dev
// switch to fight. A build fails on any page error or console error, on a request to its own
// origin that fails, and when no fight is seen: the run is kept in storage at each wave
// (hk.run, runWatch.ts) and the canvas keeps changing.
// The portal SDKs are fakes served in place of their CDN scripts, and every other outside request
// is answered empty, the backend's too (a release reads no ?api=), so the test needs no network
// and sends nothing anywhere.
//   node build/smoke.mjs                 every dist below (build them first)
//   node build/smoke.mjs web ios         just those
//   SMOKE_SECONDS=10 node build/smoke.mjs
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const CLIENT = fileURLToPath(new URL('../client/', import.meta.url));
const SECONDS = Number(process.env.SMOKE_SECONDS) || 30;

/** Each build: the folder served as the site's root and the page opened in it. */
const TARGETS = {
  web: { root: 'dist', page: '/' },
  corgi: { root: 'dist-new', page: '/new/' },
  crazygames: { root: 'dist-crazygames', page: '/' },
  playgama: { root: 'dist-playgama', page: '/' },
  ios: { root: 'dist-ios', page: '/' },
};

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

/** A static server for one dist, on a free port. */
function serve(root) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// The CrazyGames SDK v3 as the game uses it (client/src/platform/crazygames/sdk.ts): a guest
// with no ads; its data module keeps to localStorage under cg: so the run is seen there too.
const FAKE_CRAZYGAMES = `(() => {
  const calls = (window.__smokeCalls = []);
  const call = (name) => () => { calls.push(name); };
  window.CrazyGames = { SDK: {
    environment: 'local',
    init: () => Promise.resolve(),
    game: { loadingStart: call('loadingStart'), loadingStop: call('loadingStop'), gameplayStart: call('gameplayStart'),
      gameplayStop: call('gameplayStop'), happytime: call('happytime'), settings: {}, addSettingsChangeListener() {} },
    ad: { requestAd: (type, cb) => setTimeout(() => cb && cb.adError && cb.adError({ code: 'unfilled' }), 0),
      hasAdblock: () => Promise.resolve(false), prefetchAd() {} },
    user: { systemInfo: { countryCode: 'US', locale: 'en-US', device: { type: 'desktop' }, applicationType: 'web' },
      isUserAccountAvailable: false, getUser: () => Promise.resolve(null), addAuthListener() {} },
    banner: { requestBanner: () => Promise.resolve(), clearBanner() {} },
    data: { getItem: (k) => localStorage.getItem('cg:' + k), setItem: (k, v) => localStorage.setItem('cg:' + k, v) },
  } };
})();`;

// The Playgama Bridge v2 as the game uses it (client/src/platform/playgama/bridge.ts): no ads,
// storage in localStorage under pg:.
const FAKE_PLAYGAMA = `(() => {
  const calls = (window.__smokeCalls = []);
  const on = () => {};
  window.bridge = {
    version: '2.99.0-smoke',
    initialize: () => Promise.resolve(),
    platform: { id: 'mock', language: 'en', isAudioEnabled: true, on, sendMessage: (m) => { calls.push(m); return Promise.resolve(); } },
    storage: {
      get: (keys) => Promise.resolve(keys.map((k) => localStorage.getItem('pg:' + k))),
      set: (keys, values) => { keys.forEach((k, i) => localStorage.setItem('pg:' + k, values[i])); return Promise.resolve(); },
    },
    advertisement: { on, isInterstitialSupported: false, isRewardedSupported: false, showInterstitial() {}, showRewarded() {},
      checkAdBlock: () => Promise.resolve(false) },
    device: { type: 'mobile' },
    analytics: { send() {} },
  };
})();`;

const FAKES = [
  [/^https:\/\/sdk\.crazygames\.com\//, FAKE_CRAZYGAMES],
  [/^https:\/\/bridge\.playgama\.com\//, FAKE_PLAYGAMA],
];

/** The run kept in storage (any theme or portal prefix), or null. */
const keptRun = () => Object.keys(localStorage).find((k) => k.endsWith('hk.run')) ?? null;

async function smoke(browser, name, { root, page: path }) {
  const dir = resolve(CLIENT, root);
  const problems = [];
  if (!existsSync(join(dir, 'index.html')) && !existsSync(join(dir, path, 'index.html'))) return { name, problems: [`${root}/ is not built`], ms: 0 };
  const server = await serve(dir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  // a phone in portrait, as most players see it
  const context = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await context.newPage();
  const outside = new Set();
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    const fake = FAKES.find(([re]) => re.test(url));
    if (fake) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fake[1] });
    outside.add(new URL(url).host);
    return route.fulfill({ status: 204, body: '' });
  });
  page.on('pageerror', (err) => problems.push(`page error: ${err.stack ?? err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()} ${msg.location().url ?? ''}:${msg.location().lineNumber ?? ''}`);
  });
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(origin)) problems.push(`request failed: ${req.url()} ${req.failure()?.errorText ?? ''}`);
  });
  page.on('response', (res) => {
    if (res.url().startsWith(origin) && res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  const start = Date.now();
  let fought = 0;
  let moving = false;
  try {
    await page.goto(`${origin}${path}`, { waitUntil: 'load', timeout: 30_000 });
    const end = start + SECONDS * 1000;
    let last = null;
    while (Date.now() < end) {
      await page.waitForTimeout(1000);
      if (!fought) fought = (await page.evaluate(keptRun)) ? Date.now() - start : 0;
      else if (!moving) {
        // two looks at the canvas a second apart: a drawn fight never holds still
        const shot = (await page.locator('canvas').first().screenshot()).toString('base64');
        moving = last !== null && shot !== last;
        last = shot;
      }
    }
  } catch (err) {
    problems.push(`smoke: ${err.message}`);
  }
  if (!fought) problems.push(`no fight within ${SECONDS} s: no run was kept in storage`);
  else if (!moving) problems.push('the fight never moved on the canvas');
  // the page stays open: closing Chrome's contexts can take longer than the test (main exits instead)
  server.closeAllConnections();
  return { name, problems, outside: [...outside], fought, ms: Date.now() - start };
}

async function main() {
  const asked = process.argv.slice(2);
  const unknown = asked.filter((n) => !TARGETS[n]);
  if (unknown.length) throw new Error(`unknown build ${unknown.join(', ')}; one of ${Object.keys(TARGETS).join(', ')}`);
  const names = asked.length ? asked : Object.keys(TARGETS);
  const t0 = Date.now();
  // Chrome itself: the runner's (and a desktop's) installed Chrome, no download
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = await Promise.all(names.map((n) => smoke(browser, n, TARGETS[n])));
  let failed = 0;
  for (const r of results) {
    const seen = r.fought ? `, fighting from ${(r.fought / 1000).toFixed(1)} s` : '';
    const head = `${r.problems.length ? 'FAIL' : 'ok  '} ${r.name.padEnd(11)} ${(r.ms / 1000).toFixed(1)} s${seen}`;
    console.log(r.outside?.length ? `${head}  (answered empty: ${r.outside.join(', ')})` : head);
    for (const p of r.problems.slice(0, 10)) console.log(`       ${p}`);
    if (r.problems.length) failed++;
  }
  console.log(`smoke: ${names.length - failed}/${names.length} builds fought cleanly in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
