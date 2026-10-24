// The release smoke test (CI job `smoke`, before any deploy): each built dist is served as it
// ships and played in headless Chrome (playwright-core), all at once. A fresh browser goes
// straight into the first run (Shell.firstScreen), so a release build needs no dev switch to
// fight; the run is seen kept in storage at each wave (hk.run, runWatch.ts) and the canvas keeps
// changing. Then the loop is walked by input (smokeLoop.mjs): the run given up, its results, the
// lobby, a second run, the daily challenge played until it ends, and back to the lobby. Last the
// dist is deployed anew under the open page and a lazy chunk asked for: the page must reload
// once and come up (staleDeploy below).
// The page is opened with every dev URL switch (SWITCHES), which a release must not read: the first
// run must still be the save's own (chapter 1, wave 1, its relic and monk, no sutras, not hard),
// nothing may go to the `api` the query names, and no fake ad box may show. Beside the live test,
// each dist's scripts must hold no read of a switch (releaseSwitches.mjs, also in `npm run check`).
// A build fails on any page error or console error, on a request to its own origin that fails,
// on a step that never comes, and on what the backend saw (smokeBackend.mjs): the server's own
// router answers hk.gamestao.com in memory, and a post its checkers refuse, a run its
// re-simulation refuses, or a ranked or challenge run that ended but was never posted fails it.
// The portal SDKs are fakes served in place of their CDN scripts, and every other outside request
// is answered empty, so the test needs no network and sends nothing anywhere.
//   node build/smoke.mjs                 every dist below (build them first)
//   node build/smoke.mjs web ios         just those
//   SMOKE_QUICK=1 node build/smoke.mjs   only the first run's fight, for SMOKE_SECONDS (30)
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { switchReads } from './releaseSwitches.mjs';
import { backend } from './smokeBackend.mjs';
import { FIGHT_MS, moving, tap, waitFor, walkLoop } from './smokeLoop.mjs';

const CLIENT = fileURLToPath(new URL('../client/', import.meta.url));
const SECONDS = Number(process.env.SMOKE_SECONDS) || 30;
/** SMOKE_QUICK=1: only the first run's fight, as before the loop (quick local runs). */
const QUICK = process.env.SMOKE_QUICK === '1';
/** The backend every release build calls (build/theme.mjs), answered by the server's own router. */
const API = 'https://hk.gamestao.com/';
/** Every dev switch at once (CLAUDE.md "Dev URL switches"); a release reads none of them. */
const SWITCHES = 'direct&wave=20&chapter=5&sutras&hard&relic=staff&monk=fat&bare&waves=0&mobs=300&ads=fake&store=fake&notify=fake&ota=fake'
  + '&api=http://evil.test&record=5&autoplay&from=30&challenge=settle&arm=first20:short&quality=low&seed=7';
/** The host SWITCHES names as the backend: no request may go there. */
const EVIL = 'evil.test';
/** Where a failed build's last screenshot goes. */
const SHOTS = tmpdir();

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

/** A hashed build file's name (index-Ce1ZC4lK.js): what a new deploy renames. */
const HASHED = /^[\w.-]+-[\w-]{8}\.(js|css)$/;

/**
 * A static server for one dist, on a free port. `deploy()` acts out a new release under the open
 * page: every hashed file in assets/ gets a new name, the old names answer 404 (as the host's
 * do once a deploy removed them, docs on 3d71274), and the pages and chunks name the new ones.
 */
function serve(root) {
  let renamed = null;
  const rewrite = (text) => text.replace(/[\w.-]+-[\w-]{8}\.(js|css)/g, (n) => (renamed.has(n) ? renamed.get(n) : n));
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (renamed) {
      const name = basename(file);
      if (renamed.has(name)) return void res.writeHead(404).end();
      const old = [...renamed].find(([, n]) => n === name);
      if (old) file = join(dirname(file), old[0]);
    }
    if (!existsSync(file)) return void res.writeHead(404).end();
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(renamed && /^text\//.test(type) ? rewrite(readFileSync(file, 'utf8')) : readFileSync(file));
  });
  server.deploy = (assets) => {
    renamed = new Map(readdirSync(assets).filter((n) => HASHED.test(n)).map((n) => [n, n.replace(/-([\w-]{8})\./, '-$1n.')]));
  };
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

/** What the kept run (meta/resume.ts, the engine's snapshot) was set up with, beside the save's choices. */
const keptSetup = () => {
  const load = (end) => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith(end))) || 'null');
  const s = load('hk.run').snap.state;
  const save = load('hk.save') ?? {};
  return { chapter: s.config.chapter, waves: s.config.waves, hard: s.config.hard, sutras: s.config.sutras.length, monk: s.config.monk,
    wave: s.wave, relic: s.players[0]?.relicId, saveRelic: save.relic, saveMonk: save.monk };
};

/** How the first run would differ had the page read its switches; empty when it is the save's own. */
function switched(r) {
  const off = [];
  if (r.chapter !== 1 || r.wave !== 1) off.push(`chapter ${r.chapter} wave ${r.wave}, not 1/1`);
  if (!(r.waves > 0)) off.push('the waveless sandbox');
  if (r.hard) off.push('hard mode');
  if (r.sutras) off.push(`${r.sutras} sutras`);
  if (r.relic !== r.saveRelic) off.push(`relic ${r.relic}, the save's is ${r.saveRelic}`);
  if (r.monk !== r.saveMonk) off.push(`monk ${r.monk}, the save's is ${r.saveMonk}`);
  return off;
}

// The fake ad host's grey banner (?ads=fake, platform/web/banner.ts), noted the moment it shows;
// sessionStorage keeps the note across the smoke's reloads.
const FAKE_AD_WATCH = `addEventListener('DOMContentLoaded', () => setInterval(() => {
  if (/^AD /.test(document.getElementById('hk-banner')?.textContent ?? '')) sessionStorage.setItem('smoke:fakeAd', '1');
}, 250));`;

// The daily challenge opens at account level 2 (balance.json challenge.unlockLevel), some twenty
// waves of play, beyond the smoke's minutes. So once the second run is done the smoke asks for a
// raise (sessionStorage, which a reload keeps) and reloads; this script runs before the game's
// own on that load and lifts the stored save (any prefix, its backup too) to level 2 with the
// first run done. The game then reads it as any save it finds, cloud sync included.
const LEVEL_UP = `(() => {
  if (sessionStorage.getItem('smoke:level') !== '1') return;
  sessionStorage.removeItem('smoke:level');
  for (const k of Object.keys(localStorage).filter((k) => k.endsWith('hk.save') || k.endsWith('hk.save.bak'))) {
    try {
      const s = JSON.parse(localStorage.getItem(k));
      localStorage.setItem(k, JSON.stringify({ ...s, level: Math.max(2, s.level || 1), firstRunDone: true }));
    } catch {}
  }
})();`;

/** Opens the stale page's language list and picks German, whose chunk the page has not loaded yet. */
async function lazyChunk(page) {
  await page.keyboard.press('Escape');
  await tap(page, 'language');
  await tap(page, 'lang:de');
}

/**
 * The stale deploy (3d71274): with the page up in a run, the dist is deployed anew under it and a
 * lazy chunk is asked for; its old name is gone, so the page must reload once on the new names
 * and come up again (a screen placed, the canvas drawn), not stay black or reload again.
 */
async function staleDeploy(page, server, dir, path) {
  await tap(page, 'play', 15_000);
  await waitFor(page, (l) => l.screen === 'run', 20_000, 'the run before the deploy');
  let loads = 0;
  const onLoad = (f) => f === page.mainFrame() && loads++;
  page.on('framenavigated', onLoad);
  server.deploy(join(dir, path, 'assets'));
  await lazyChunk(page);
  const end = Date.now() + 20_000;
  while (!loads && Date.now() < end) await page.waitForTimeout(250);
  if (!loads) throw new Error('the stale page never reloaded after its chunk was gone');
  await page.waitForLoadState('load');
  await waitFor(page, (l) => l.screen && l.screen !== 'other' || Object.keys(l.spots).length > 0, 20_000, 'the page after its reload');
  await page.waitForTimeout(3000);
  page.off('framenavigated', onLoad);
  if (loads > 1) throw new Error(`the stale page reloaded ${loads} times`);
  const shot = await page.locator('canvas').first().screenshot();
  if (shot.length < 5000) throw new Error('the canvas is blank after the reload');
}

async function smoke(browser, name, { root, page: path }) {
  const dir = resolve(CLIENT, root);
  if (!existsSync(join(dir, 'index.html')) && !existsSync(join(dir, path, 'index.html'))) return { name, problems: [`${root}/ is not built`], ms: 0 };
  const reads = switchReads(dir);
  const problems = reads.length ? [`reads ${reads.length} dev switches: client/${reads.slice(0, 4).join(', client/')}${reads.length > 4 ? ', ...' : ''}`] : [];
  const server = await serve(dir);
  const api = await backend();
  const origin = `http://127.0.0.1:${server.address().port}`;
  // a phone in portrait, as most players see it, in a time zone where stats go out without asking
  const context = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'America/New_York' });
  await context.addInitScript(LEVEL_UP);
  await context.addInitScript(FAKE_AD_WATCH);
  const page = await context.newPage();
  const outside = new Set();
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (url.startsWith(API)) return api.handle(route);
    const fake = FAKES.find(([re]) => re.test(url));
    if (fake) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fake[1] });
    outside.add(new URL(url).host);
    if (new URL(url).hostname === EVIL && !problems.some((p) => p.includes(EVIL))) problems.push(`a request went to the ?api= of the query: ${url}`);
    return route.fulfill({ status: 204, body: '' });
  });
  // from the stale deploy on, the old names' 404s and what they break are the point, not problems
  let stale = false;
  const problem = (p) => !stale && problems.push(p);
  page.on('pageerror', (err) => problem(`page error: ${err.stack ?? err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problem(`console error: ${msg.text()} ${msg.location().url ?? ''}:${msg.location().lineNumber ?? ''}`);
  });
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(origin)) problem(`request failed: ${req.url()} ${req.failure()?.errorText ?? ''}`);
  });
  page.on('response', (res) => {
    if (res.url().startsWith(origin) && res.status() >= 400) problem(`HTTP ${res.status()}: ${res.url()}`);
  });
  const start = Date.now();
  const steps = [];
  let fought = 0;
  let moved = false;
  try {
    await page.goto(`${origin}${path}?${SWITCHES}`, { waitUntil: 'load', timeout: 30_000 });
    const end = start + SECONDS * 1000;
    // the quick smoke watches the first run for all its time; the loop goes on once it fights
    while (Date.now() < end && (QUICK || !moved)) {
      await page.waitForTimeout(1000);
      if (!fought && (await page.evaluate(keptRun))) {
        fought = Date.now() - start;
        for (const off of switched(await page.evaluate(keptSetup))) problems.push(`the first run read a dev switch: ${off}`);
      } else if (fought && !moved) moved = await moving(page);
    }
    // long enough a fight for the server to rank its give-up
    if (fought) await page.waitForTimeout(Math.max(0, start + fought + FIGHT_MS - Date.now()));
    if (!QUICK && moved) {
      await walkLoop(page, (s) => steps.push(s));
      stale = true;
      await staleDeploy(page, server, dir, path);
      steps.push('reloaded after a deploy');
    }
  } catch (err) {
    stale = false;
    problems.push(`smoke: ${err.message}`);
    await page.screenshot({ path: join(SHOTS, `smoke-${name}.png`) }).then(() => problems.push(`screenshot: ${join(SHOTS, `smoke-${name}.png`)}`), () => {});
  }
  stale = false;
  if (await page.evaluate(() => sessionStorage.getItem('smoke:fakeAd')).catch(() => null)) problems.push('the fake ad box (?ads=fake) showed');
  if (!fought) problems.push(`no fight within ${SECONDS} s: no run was kept in storage`);
  else if (!moved) problems.push('the fight never moved on the canvas');
  if (!QUICK) problems.push(...(await api.problems()));
  // the page stays open: closing Chrome's contexts can take longer than the test (main exits instead)
  server.closeAllConnections();
  return { name, problems, outside: [...outside], fought, steps, posts: api.posts.length, ms: Date.now() - start };
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
    const seen = (r.fought ? `, fighting from ${(r.fought / 1000).toFixed(1)} s` : '') + (r.steps?.length ? `, then ${r.steps.join(' > ')} (${r.posts} posts)` : '');
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
