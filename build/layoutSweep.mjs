// The layout sweep (docs/layout-sweep.md): the game's screens on phones, a tablet and the desktop
// sizes the portals show it at, each judged by the in-page auditor (client/src/dev/layoutAudit.ts)
// for labels that collide, spill out of their panel, fall off the canvas, sit under opaque art or
// come out too small to read. Findings are compared with build/layout-baseline.json: a new one
// fails the sweep, one that went away is reported as fixed. Not part of `npm run check`.
//   npm run sweep:layout                          every viewport, against this checkout's own dev server
//   npm run sweep:layout -- --only 390x844,1100x574
//   npm run sweep:layout -- --update              record what it saw as the new baseline
//   npm run sweep:layout -- --url http://localhost:5174/   a dev server already running
//   npm run sweep:layout -- --headless            no window (slower: a hidden page barely ticks)
// It opens the system Chrome in a window of its own, as tools/record_video.mjs does: a hidden or
// throttled page stops drawing. Screenshots and report.json go to layout-report/ (not committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { compare, describe, keyOf, readBaseline, tally, writeBaseline } from './layoutBaseline.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BASELINE = join(ROOT, 'build', 'layout-baseline.json');

/**
 * The sizes the game is played at. Phones and tablets get touch and a device pixel ratio; the
 * desktop ones are CSS sizes at ratio 1: CrazyGames' reviewer canvas and its preview tile, then
 * the common laptop and monitor windows.
 */
const VIEWPORTS = [
  { name: '360x640', kind: 'phone', w: 360, h: 640, dpr: 2, touch: true },
  { name: '390x844', kind: 'phone', w: 390, h: 844, dpr: 3, touch: true },
  { name: '430x932', kind: 'phone', w: 430, h: 932, dpr: 3, touch: true },
  { name: '768x1024', kind: 'tablet', w: 768, h: 1024, dpr: 2, touch: true },
  { name: '1024x768', kind: 'tablet on its side', w: 1024, h: 768, dpr: 2, touch: true },
  { name: '1100x574', kind: 'CrazyGames reviewer', w: 1100, h: 574, dpr: 1, touch: false },
  { name: '722x406', kind: 'CrazyGames preview', w: 722, h: 406, dpr: 1, touch: false },
  { name: '1280x720', kind: 'desktop', w: 1280, h: 720, dpr: 1, touch: false },
  { name: '1366x768', kind: 'desktop', w: 1366, h: 768, dpr: 1, touch: false },
  { name: '1920x1080', kind: 'desktop', w: 1920, h: 1080, dpr: 1, touch: false },
  // short windows: a browser's toolbars and bookmarks bar over a 1080p screen, and a small laptop's
  { name: '1920x945', kind: 'short desktop', w: 1920, h: 945, dpr: 1, touch: false },
  { name: '1280x575', kind: 'short desktop', w: 1280, h: 575, dpr: 1, touch: false },
];

/** The lobby tabs, the play tab last so settings open over it. */
const TABS = ['shop', 'gear', 'train', 'codex', 'play'];
/**
 * The lobby's panels, each opened alone over the play tab (or the gear tab) by the screen's own
 * fields, as its buttons would: the tallest ones run off a short landscape window first.
 */
const PANELS = {
  tasks: `s.openTab('play'); s.econ.tasksView = 'daily'; s.econ.modal = 'tasks'`,
  goals: `s.openTab('play'); s.econ.tasksView = 'week'; s.econ.modal = 'tasks'`,
  merit: `s.openTab('play'); s.econ.tasksView = 'merit'; s.econ.modal = 'tasks'`,
  achievements: `s.openTab('play'); s.econ.tasksView = 'achieve'; s.econ.modal = 'tasks'`,
  patrol: `s.openTab('play'); s.econ.modal = 'patrol'`,
  gift: `s.openTab('play'); s.econ.modal = 'gift'`,
  monks: `s.openTab('play'); s.monksOpen = true`,
  account: `s.openTab('play'); s.settingsOpen = true; s.accountOpen = true`,
  'challenge.daily': `s.openTab('play'); s.challenge.open = true; s.challenge.tab = 'daily'`,
  'challenge.weekly': `s.openTab('play'); s.challenge.open = true; s.challenge.tab = 'weekly'`,
  'gear.detail': `s.openTab('gear'); s.gearOpen = 'robe'`,
};
/** The runs judged: chapter 6's wave 6, played by the bot on a fixed seed so its level-ups offer the same cards each sweep. */
const RUN_QUERY = 'direct&autoplay&wave=11&seed=7&ads=fake';
/** How long a screen gets to settle (slides, fades, counters) before it is judged. */
const SETTLE_MS = 900;

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt('only')?.split(',');
const update = args.includes('--update');
const headless = args.includes('--headless');
const out = join(ROOT, opt('out') ?? 'layout-report');

/**
 * A mid-game player: chapters 1-5 cleared, every tab seen, coin to spend, so no first-run screen.
 * The board name is fixed too (protocol.ts packDice(14, 0, 48)), or every launch rolls a new one.
 */
const SAVE_PATCH = {
  firstRunDone: true, dice: 1 + 14 + 16 * 0 + 256 * (48 - 10), level: 18, xp: 0, copper: 12000, jade: 450, chapter: 6, cleared: 5,
  stars: [3, 3, 3, 2, 2], runs: 46, seen: 31, kills: 25000,
};

/** Starts this checkout's dev server on a free port, unless --url names one. */
async function devServer() {
  const url = opt('url');
  if (url) return { url: url.replace(/\/?$/, '/'), close: async () => undefined };
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: join(ROOT, 'client', 'vite.config.js'),
    root: join(ROOT, 'client'),
    logLevel: 'warn',
    server: { port: 5194, strictPort: false, host: 'localhost', open: false },
  });
  await server.listen();
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

/** The storage of a mid-game save, as SaveStore writes it, read from a page of the dev server. */
async function seedStorage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(`${url}?ads=fake`);
    await page.waitForFunction(() => globalThis.__shell, null, { timeout: 60_000 });
    return await page.evaluate(async (patch) => {
      const { SaveStore } = await import('/src/meta/saveStore.ts');
      const { newSave } = await import('/src/meta/save.ts');
      const { browserStorage } = await import('/src/platform/web/WebPlatform.ts');
      const { BALANCE } = await import('/src/meta/balance.ts');
      const { seasonOf } = await import('/src/meta/merit.ts');
      const save = { ...newSave(), ...patch };
      // the merit path part way along: two steps paid, more reached
      save.merit = { season: seasonOf(Date.now()), points: 700, claimed: 0b11 };
      save.best = save.best.map((b, i) => (i < patch.cleared ? BALANCE.waves : b));
      localStorage.clear();
      new SaveStore(browserStorage()).save(save);
      return Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
    }, SAVE_PATCH);
  } finally {
    await page.close();
  }
}

/** Judges what the shell's UI layer shows now (the run's world is left out: it moves). */
async function audit(page) {
  return page.evaluate(async () => {
    const { auditLayout, AUDIT_DEFAULTS } = await import('/src/dev/layoutAudit.ts');
    const app = globalThis.__app;
    const shell = globalThis.__shell;
    const uiScale = shell.screen?.view?.scale?.x ?? 1;
    const cssPerPx = app.canvas.getBoundingClientRect().width / app.screen.width;
    return auditLayout(shell.ui, app.screen.width, app.screen.height, { ...AUDIT_DEFAULTS, uiScale, cssPerPx });
  });
}

/** What a result says, without what moves on its own: label count, masked keys, rects to 4 px. */
const signature = (r) => JSON.stringify([r.labels, r.findings.map((f) => [keyOf('', '', f), ...['x', 'y', 'w', 'h'].map((k) => Math.round(f.rectA[k] / 4))])]);

/**
 * Audits until two looks in a row agree: a results screen reveals its lines one by one and a
 * number pops in at a larger scale, so a single look can catch it half drawn.
 */
async function steady(page, maxMs = 12_000) {
  let last = await audit(page);
  for (const end = Date.now() + maxMs; Date.now() < end; ) {
    await settle(page, 600);
    const next = await audit(page);
    if (signature(next) === signature(last)) return next;
    last = next;
  }
  return last;
}

const until = (page, fn, arg, timeout = 30_000) => page.waitForFunction(fn, arg, { polling: 100, timeout });
const settle = (page, ms = SETTLE_MS) => page.waitForTimeout(ms);

/** Opens a run with the dev switches and waits until its HUD is up. */
async function openRun(page, url, query) {
  await page.goto(`${url}?${query}`);
  await until(page, () => globalThis.__shell?.place() === 'run' && __shell.run?.engine.state.tick > 30, undefined, 60_000);
  // the bot moves and fights, but every level-up waits for the sweep (`pick` below)
  await page.evaluate(() => { __shell.run.autoplay.pick = () => undefined; });
}

/** Takes card 0 of every offer up, level-ups queued behind it too, until none is. */
async function pickAny(page) {
  await until(page, () => {
    if (__shell.run.engine.state.players[0].offer.length === 0) return true;
    __shell.run.pick(0);
    return false;
  });
}

/** The stops of one viewport, in order: each a screen name and how to get there from the last. */
function stops(url) {
  const lobby = TABS.map((tab) => ({
    screen: `lobby.${tab}`,
    go: async (page) => {
      if (tab === TABS[0]) {
        // `challenge`: the challenge panel's daily and weekly runs, made up on the device offline
        await page.goto(`${url}?ads=fake&challenge`);
        await until(page, () => globalThis.__shell?.place() === 'lobby', undefined, 60_000);
      }
      // openTab and openSettings set what the next layout draws; relayout draws it now
      await page.evaluate((t) => { __shell.screen.openTab(t); __shell.screen.relayout(); }, tab);
      await until(page, (t) => __shell.screen.shownTab === t, tab);
    },
  }));
  const panels = Object.entries(PANELS).map(([name, code]) => ({
    screen: `lobby.${name}`,
    go: (page) => page.evaluate((code) => {
      const s = __shell.screen;
      s.settingsOpen = s.accountOpen = s.monksOpen = false;
      s.gearOpen = null;
      s.econ.modal = null;
      s.challenge.open = false;
      new Function('s', code)(s);
      s.relayout();
    }, code),
  }));
  return [
    ...lobby,
    { screen: 'settings', go: (page) => page.evaluate(() => { __shell.screen.openSettings(); __shell.screen.relayout(); }) },
    ...panels,
    {
      screen: 'run.hud',
      go: async (page) => {
        await openRun(page, url, RUN_QUERY);
        await pickAny(page);
        // held still without the pause panel, so no level-up comes while it is judged
        await page.evaluate(() => { __shell.run.paused = true; });
      },
    },
    {
      screen: 'run.cards',
      go: async (page) => {
        await page.evaluate(() => { __shell.run.paused = false; });
        await until(page, () => __shell.run.engine.state.players[0].offer.length > 0, undefined, 60_000);
      },
    },
    {
      screen: 'run.pause',
      go: async (page) => {
        await pickAny(page);
        await page.evaluate(() => __shell.runs.hud.pauseForHost());
        await until(page, () => __shell.runs.hud.pauseShown);
      },
    },
    {
      screen: 'run.down',
      go: async (page) => {
        await page.keyboard.press('Escape');
        await until(page, () => !__shell.runs.hud.pauseShown && !__shell.run.paused);
        await pickAny(page);
        await page.evaluate(() => {
          const s = __shell.run.engine.state;
          s.players[0].hp = 0;
          s.outcome = 'lost';
        });
        await until(page, () => __shell.runs.watch?.downShown === true);
        // the kill cam's slow motion plays out first
        await settle(page, 2500);
      },
    },
    {
      screen: 'results.lost',
      go: async (page) => {
        await page.keyboard.press('Escape');
        await until(page, () => __shell.place() === 'results');
        await settle(page, 2500);
      },
    },
    {
      screen: 'results.won',
      go: async (page) => {
        await openRun(page, url, RUN_QUERY);
        await page.evaluate(() => {
          const s = __shell.run.engine.state;
          s.wave = s.config.waves;
          s.outcome = 'won';
        });
        await until(page, () => __shell.place() === 'results', undefined, 60_000);
        await settle(page, 3000);
      },
    },
  ];
}

/** Walks every stop on one viewport; a stop that cannot be reached is reported, not skipped silently. */
async function sweepViewport(browser, url, storage, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.touch,
    hasTouch: vp.touch,
  });
  // every page load starts from the same mid-game save, no run left to resume and the same dice
  // (the view's rolls, such as a results screen's drops, size its panels: as in testkit/seedRandom.ts)
  await context.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    let a = 0x9e3779b9;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, storage);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const reports = [];
  const failed = [];
  try {
    for (const stop of stops(url)) {
      try {
        await stop.go(page);
        await settle(page);
        const r = await steady(page);
        reports.push({ viewport: vp.name, screen: stop.screen, labels: r.labels, findings: r.findings });
        await page.screenshot({ path: join(out, `${vp.name}-${stop.screen}.png`) });
      } catch (e) {
        failed.push(`${vp.name} ${stop.screen}: ${e.message.split('\n')[0]}`);
        await page.screenshot({ path: join(out, `${vp.name}-${stop.screen}-failed.png`) }).catch(() => undefined);
      }
    }
  } finally {
    await context.close();
  }
  return { reports, failed, errors: errors.map((m) => `${vp.name}: page error: ${m}`) };
}

async function main() {
  const viewports = VIEWPORTS.filter((v) => !only || only.includes(v.name));
  if (viewports.length === 0) throw new Error(`no viewport in --only ${only}; known: ${VIEWPORTS.map((v) => v.name).join(', ')}`);
  mkdirSync(out, { recursive: true });
  const server = await devServer();
  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      '--window-size=1940,1200',
    ],
  });
  const reports = [];
  const failed = [];
  try {
    console.log(`layout sweep on ${server.url}`);
    const storage = await seedStorage(browser, server.url);
    for (const vp of viewports) {
      const r = await sweepViewport(browser, server.url, storage, vp);
      console.log(`\n${vp.name} (${vp.kind})`);
      for (const rep of r.reports) {
        console.log(`  ${rep.screen}: ${rep.labels} labels, ${rep.findings.length} findings`);
        for (const f of rep.findings) console.log(`    ${describe(vp.name, rep.screen, f)}`);
      }
      for (const f of [...r.failed, ...r.errors]) console.log(`  FAILED ${f}`);
      reports.push(...r.reports);
      failed.push(...r.failed, ...r.errors);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  writeFileSync(join(out, 'report.json'), JSON.stringify(reports, null, 2) + '\n');
  const counts = tally(reports);
  const walked = new Set(reports.map((r) => `${r.viewport} ${r.screen}`));
  const empty = reports.filter((r) => r.labels === 0).map((r) => `${r.viewport} ${r.screen}: no labels found`);
  failed.push(...empty);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n${reports.length} screens, ${total} findings; screenshots and report.json in ${out}`);
  if (update) {
    if (failed.length) throw new Error(`not updating the baseline: ${failed.length} stops failed`);
    console.log(`baseline updated: ${writeBaseline(BASELINE, counts, walked)} keys in ${BASELINE}`);
    return 0;
  }
  const { added, gone } = compare(counts, readBaseline(BASELINE), walked);
  for (const k of gone) console.log(`fixed (drop it with --update): ${k}`);
  for (const k of added) console.log(`NEW: ${k}`);
  for (const f of failed) console.log(`FAILED: ${f}`);
  console.log(added.length || failed.length ? `\nlayout sweep failed: ${added.length} new findings, ${failed.length} failures` : '\nlayout sweep passed: nothing over the baseline');
  return added.length || failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(e);
  process.exit(1);
});
