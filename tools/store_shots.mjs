// Takes the App Store screenshots of one app in one language (docs/store.md "Screenshots").
// usage: node tools/store_shots.mjs <monk|corgi> <en|zh> [--only horde,cards] [--seed 7] [--out dir]
// Needs the theme's dev server: `npm run dev` (port 5174) for monk, `npm run dev:new` (5184) for
// corgi. It opens the system Chrome in a window of its own (a hidden page stops drawing) at
// 393x852 and 3x, so every shot is the 6.1"/6.3" iPhone's 1179x2556. The balance bot plays each
// scene (?direct&autoplay&from=N&chapter=C) until its moment comes, the dev fps readout is hidden
// and the page is captured; the lobby seeds a save two chapters in. A bot that falls on the way
// never reaches its moment, so that take fails: run it again with another --seed.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const [theme, lang] = args;
if (!['monk', 'corgi'].includes(theme) || !['en', 'zh'].includes(lang)) {
  console.error('usage: node tools/store_shots.mjs <monk|corgi> <en|zh> [--only horde,cards] [--seed N] [--out dir]');
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const seed = opt('seed', '7');
const out = opt('out', theme === 'monk' ? 'art/store/ios' : 'art/reskin/corgi/ios/store');
const origin = theme === 'monk' ? 'http://localhost:5174' : 'http://localhost:5184';
// the corgi's browser keys sit under its prefix (client/src/theme.ts)
const key = (k) => (theme === 'monk' ? k : `${theme}:${k}`);

// a save two chapters in, for the lobby (client/src/meta/save.ts fills in the rest)
const SAVE = {
  firstRunDone: true, level: 12, xp: 0, copper: 4200, jade: 160, chapter: 3, cleared: 2,
  best: [50, 50, 24, 0, 0], chests: [31, 31, 3, 0, 0], opened: [31, 31, 3, 0, 0], runs: 9,
  relic: 'ball', trained: 6, seen: 0xff,
};

// Each scene: the url's switches, and when the bot has reached the moment to capture.
const SCENES = {
  // a chapter 1 horde at wave 30
  horde: { q: 'chapter=1&from=30', ready: (s) => s.wave >= 30, settle: 6000 },
  // the level-up cards, early in chapter 2 (held up while they fade in: the bot would pick at 1.3 s)
  cards: { q: 'chapter=2&from=8', ready: (s) => s.wave >= 8 && s.players[0].offer.length > 0, settle: 1500, hold: true },
  // the wave 20 mid-boss of chapter 1
  boss: { q: 'chapter=1&from=20', ready: (s) => s.wave >= 20, settle: 11000 },
  // chapter 3 at wave 12
  ch3: { q: 'chapter=3&from=12', ready: (s) => s.wave >= 12, settle: 6000 },
  lobby: { q: '', ready: null, settle: 4000 },
  // App Review's screenshot of the ad-free purchase: the Shop tab of a new player's lobby, with
  // the fake store's card (not one of the listing's five; taken only when asked for with --only)
  iap: { q: 'store=fake', ready: null, settle: 3000, save: { firstRunDone: true, runs: 1 }, tap: [39, 822] },
};
const only = opt('only', 'horde,cards,boss,ch3,lobby').split(',');

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--window-size=500,1000',
  ],
});
mkdirSync(out, { recursive: true });
try {
  for (const [i, name] of Object.keys(SCENES).entries()) {
    if (!only.includes(name)) continue;
    const scene = SCENES[name];
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const settings = { locale: lang, dataSharing: 'no', noticeSeen: true };
    await ctx.addInitScript(
      ([k, v, sk, sv]) => {
        localStorage.setItem(k, v);
        if (sk) localStorage.setItem(sk, sv);
      },
      [key('hk.settings'), JSON.stringify(settings), scene.ready ? '' : key('hk.save'), JSON.stringify(scene.save ?? SAVE)],
    );
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    const url = scene.ready ? `${origin}/?direct&autoplay&${scene.q}&seed=${seed}&quality=high` : `${origin}/?${scene.q}`;
    console.log(`${name}: ${url}`);
    await page.goto(url);
    if (scene.ready) {
      await page.waitForFunction(
        (src) => {
          const run = globalThis.__shell?.run;
          if (!run) return false;
          if (run.engine.state.outcome !== 'playing') throw new Error('the bot fell');
          return new Function('s', `return (${src})(s)`)(run.engine.state);
        },
        scene.ready.toString(),
        { polling: 100, timeout: 240000 },
      );
    }
    if (scene.hold) {
      await page.evaluate(() => {
        __shell.run.autoplay.offerMs = -60000;
      });
    }
    await page.waitForTimeout(scene.settle);
    // a bot that falls while the scene settles starts a fresh run, which is no shot either
    if (scene.ready && !(await page.evaluate((src) => new Function('s', `return (${src})(s)`)(__shell.run.engine.state), scene.ready.toString()))) {
      throw new Error(`${name}: the bot fell while the scene settled; try another --seed`);
    }
    // a battle scene never catches level-up cards that came up while it settled
    if (scene.ready && !scene.hold) {
      await page.waitForFunction(() => __shell.run.engine.state.players[0].offer.length === 0, null, { polling: 100, timeout: 30000 });
      await page.waitForTimeout(300);
    }
    if (scene.tap) {
      await page.mouse.click(...scene.tap);
      await page.waitForTimeout(1500);
    }
    await page.evaluate(() => {
      const label = globalThis.__shell?.run?.label;
      if (label) label.visible = false;
    });
    const file = join(out, name === 'iap' ? `iap_adfree_review_${lang}.png` : `${lang}_${i + 1}_${name}.png`);
    await page.screenshot({ path: file });
    console.log(`saved ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
