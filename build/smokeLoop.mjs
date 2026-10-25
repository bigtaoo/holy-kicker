// The smoke's walk through the game's loop (build/smoke.mjs), by input only, as a player would:
// the first run given up from the pause panel, its results, the lobby, a second run, the daily
// challenge from the lobby played until it ends, and back to the lobby. The canvas has nothing to
// find a button by, so the game writes where its main buttons are (client/src/ui/spots.ts): the
// screen's place in `data-hk-screen` and the shown buttons' centres in `data-hk-spots` on <html>.

/**
 * How long each run is fought before it is given up: the server refuses a run shorter than 4 s a
 * wave (protocol.ts LIMITS.minSecondsPerWave), so a give-up any sooner is not ranked. That is the
 * run's own clock, which falls behind the wall's when five builds share a CI runner's software GL.
 */
export const FIGHT_MS = 12_000;

/** The page's place (lobby, results, run, other) and its buttons' centres. */
export const look = (page) => page.evaluate(() => {
  const d = document.documentElement.dataset;
  return { screen: d.hkScreen ?? null, spots: JSON.parse(d.hkSpots ?? '{}') };
});

/** Waits until `test` holds for the page's look; throws what was seen instead after `ms`. */
export async function waitFor(page, test, ms, what) {
  const end = Date.now() + ms;
  let seen = null;
  while (Date.now() < end) {
    seen = await look(page);
    if (test(seen)) return seen;
    await page.waitForTimeout(250);
  }
  throw new Error(`${what} not seen within ${ms / 1000} s (on ${seen?.screen ?? 'no screen'}, buttons: ${JSON.stringify(seen?.spots ?? {})})`);
}

/** Taps the button `name` once it shows. */
export async function tap(page, name, ms = 10_000) {
  const s = await waitFor(page, (l) => l.spots[name], ms, `the ${name} button`);
  await page.mouse.click(s.spots[name][0], s.spots[name][1]);
}

/**
 * Taps the button `name` until `test` holds for the page's look (a tap can land while the screen
 * is still coming in); throws after `ms`.
 */
export async function tapUntil(page, name, test, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const l = await look(page);
    if (test(l)) return l;
    if (l.spots[name]) await page.mouse.click(l.spots[name][0], l.spots[name][1]);
    await page.waitForTimeout(1000);
  }
  return waitFor(page, test, 1, what);
}

/** Whether the canvas changes over `ms`: a drawn fight never holds still. */
export async function moving(page, ms = 1000) {
  const canvas = page.locator('canvas').first();
  const a = await canvas.screenshot();
  await page.waitForTimeout(ms);
  return !a.equals(await canvas.screenshot());
}

/** Gives the run up: Escape opens the pause panel, give up asks once more, then the results. */
async function giveUp(page) {
  // one loop from what shows each time, never from what an Escape was meant to do: on a CI runner a
  // frame can take seconds, so an Escape sent again closes the panel the last one opened while the
  // written buttons still show it, and a give-up that only taps from then on waits on nothing
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    const l = await look(page);
    if (l.screen === 'results') return;
    if (l.spots.giveUp) {
      // the first tap asks to confirm, the next one gives up
      await page.mouse.click(l.spots.giveUp[0], l.spots.giveUp[1]);
      await page.waitForTimeout(1000);
    } else if (l.spots.card) {
      // a level-up's cards hold the run (and the key): the first card is tapped until they go
      await page.mouse.click(l.spots.card[0], l.spots.card[1]);
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Escape');
      await waitFor(page, (s) => s.spots.giveUp || s.spots.card || s.screen === 'results', 2000, 'the pause panel').catch(() => {});
    }
  }
  await waitFor(page, (l) => l.screen === 'results', 1, 'the results');
}

/** From the results to the lobby. */
const toLobby = (page, button) => tapUntil(page, button, (l) => l.screen === 'lobby' && l.spots.play, 30_000, 'the lobby');

/** Waits for a run to be on screen and drawing. */
async function fighting(page, what) {
  await waitFor(page, (l) => l.screen === 'run', 20_000, what);
  await page.waitForTimeout(FIGHT_MS);
  if (!(await moving(page))) throw new Error(`${what} never moved on the canvas`);
}

/**
 * The loop after the first run is seen fighting; `step(name)` is told each stage as it is reached.
 * Throws at the first stage that does not come.
 */
export async function walkLoop(page, step) {
  await giveUp(page);
  step('results');
  await toLobby(page, 'lobby');
  step('lobby');
  await tapUntil(page, 'play', (l) => l.screen === 'run', 20_000, 'the second run');
  await fighting(page, 'the second run');
  step('second run');
  await giveUp(page);
  await toLobby(page, 'lobby');
  // the daily wants account level 2: the save is raised on a reload (smoke.mjs LEVEL_UP)
  await page.evaluate(() => sessionStorage.setItem('smoke:level', '1'));
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, (l) => l.screen === 'lobby' && l.spots.daily, 30_000, 'the lobby at level 2');
  await tapUntil(page, 'daily', (l) => l.spots.challengePlay, 15_000, 'the daily challenge');
  await tapUntil(page, 'challengePlay', (l) => l.screen === 'run', 20_000, 'the daily run');
  await fighting(page, 'the daily challenge');
  step('daily');
  await giveUp(page);
  step('daily results');
  await toLobby(page, 'next');
  step('lobby again');
}
