import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { fakeAds } from '../testkit/lobbyRig';
import { liveRun, type LiveRun } from '../testkit/liveRun';
import { clearedChapterOne, findTap, tap, tapWhenUp } from '../testkit/testShell';

// The revives as the player meets them on a live run through the real Shell: training's free ones
// first, without an ad, then the rewarded ad's, whose skipped or unfilled ad leaves the hero down
// and the death panel as it was, and whose paid one stands him up once.

/** Training's line bought past its first free-revive node (training.reviveNodes). */
const TRAINED = { ...clearedChapterOne(), trained: 12 };

/** The hero falls where he stands, as the engine leaves a downed one. */
function fell(run: LiveRun): void {
  const s = run.sim();
  const p = s.players[0];
  p.hp = 0;
  p.dead = true;
  s.outcome = 'lost';
}

/** Whether the button reading `t(key)` is on screen and takes taps. */
function tappable(run: LiveRun, key: string): boolean {
  return findTap(run.app.stage, t(key as never)) !== null;
}

describe('revives on a live run', () => {
  it("a free revive first, no ad; then the ad's: skipped keeps the panel, paid stands him up once", async () => {
    const ads = fakeAds();
    const run = await liveRun({ ads, save: TRAINED });
    // the ad's revive and the free one
    expect(run.sim().players[0].revives).toBe(2);
    await run.ticks(5);

    fell(run);
    await tapWhenUp(run, 'run.reviveFree');
    await run.ticks(2);
    expect(ads.plays).toBe(0);
    expect(run.sim().outcome).toBe('playing');
    expect(run.sim().players[0]).toMatchObject({ dead: false, revives: 1 });
    expect(run.texts()).not.toContain(t('run.down'));

    // the free one is used up: the next fall offers the ad
    fell(run);
    await tapWhenUp(run, 'run.revive');
    expect(ads.plays).toBe(1);
    await run.tick(1);
    // while it plays the panel waits on it: no revive to tap again, no way out
    expect(run.texts()).toContain(t('run.adLoading'));
    expect(tappable(run, 'run.giveUp')).toBe(false);
    run.platform.press('Escape');
    expect(run.shell.place()).toBe('run');

    // closed early: still down, the offer back and the way out open
    ads.finish(false);
    await run.tick(2);
    expect(run.sim().outcome).toBe('lost');
    expect(run.sim().players[0].revives).toBe(1);
    expect(tappable(run, 'run.revive')).toBe(true);
    expect(tappable(run, 'run.giveUp')).toBe(true);

    // a second try that pays: up again, with no revive left
    await tapWhenUp(run, 'run.revive');
    expect(ads.plays).toBe(2);
    ads.finish(true);
    await run.ticks(2);
    expect(run.sim().outcome).toBe('playing');
    expect(run.sim().players[0]).toMatchObject({ dead: false, revives: 0 });
    expect(run.texts()).not.toContain(t('run.down'));

    // with none left a fall goes straight to the results
    fell(run);
    await run.until(() => run.shell.place() === 'results');
    expect(ads.plays).toBe(2);
    expect(run.faults).toEqual([]);
  });

  it('gives up from the death panel after an ad that never paid', async () => {
    const ads = fakeAds();
    const run = await liveRun({ ads });
    await run.ticks(5);
    fell(run);
    await tapWhenUp(run, 'run.revive');
    ads.finish(false);
    await run.tick(2);
    tap(findTap(run.app.stage, t('run.giveUp'))!);
    await run.until(() => run.shell.place() === 'results');
    expect(run.store.load().runs).toBe(4);
    expect(run.faults).toEqual([]);
  });

  it('on a desktop, Enter revives and Escape gives up', async () => {
    const ads = fakeAds();
    const run = await liveRun({ ads, device: 'desktop', save: TRAINED });
    await run.ticks(5);
    fell(run);
    await run.until(() => tappable(run, 'run.reviveFree'));
    run.platform.press('Enter');
    await run.ticks(2);
    expect(run.sim().outcome).toBe('playing');
    expect(ads.plays).toBe(0);

    fell(run);
    await run.until(() => tappable(run, 'run.revive'));
    run.platform.press('Enter');
    expect(ads.plays).toBe(1);
    // the keys wait out the ad
    run.platform.press('Escape');
    await run.tick(1);
    expect(run.shell.place()).toBe('run');
    ads.finish(false);
    await run.tick(2);
    run.platform.press('Escape');
    await run.until(() => run.shell.place() === 'results');
    expect(run.faults).toEqual([]);
  });

  it('a host that throws mid-ad leaves him down with the panel open', async () => {
    const ads = fakeAds();
    let throws = true;
    const rewarded = ads.rewarded.bind(ads);
    ads.rewarded = (started) => (throws ? Promise.reject(new Error('host')) : rewarded(started));
    const run = await liveRun({ ads });
    await run.ticks(5);
    fell(run);
    await tapWhenUp(run, 'run.revive');
    await run.tick(2);
    expect(run.sim().outcome).toBe('lost');
    expect(tappable(run, 'run.revive')).toBe(true);
    expect(tappable(run, 'run.giveUp')).toBe(true);
    // the next try reaches the host again and pays
    throws = false;
    await tapWhenUp(run, 'run.revive');
    ads.finish(true);
    await run.ticks(2);
    expect(run.sim().outcome).toBe('playing');
    expect(run.faults).toEqual([]);
  });

  it("asks no ad when the host has none to play: the fall goes to the results", async () => {
    const ads = { ...fakeAds(), rewardedAvailable: async () => false };
    const run = await liveRun({ ads });
    await run.ticks(5);
    fell(run);
    await run.until(() => run.shell.place() === 'results');
    expect(run.faults).toEqual([]);
  });
});
