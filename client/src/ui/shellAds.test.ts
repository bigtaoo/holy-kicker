import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import type { Ads, Banner, Portal } from '../platform/types';
import { NO_PORTAL } from '../platform/types';
import { clearedChapterOne, deviceWith, endRun, rigShell, tapLabel, tapNamed } from '../testkit/testShell';

// The host hooks as the whole shell drives them: the lobby banner up and down with the lobby, the
// portal told the game loaded before the first gameplay bracket, and the sound held while an ad
// is on screen, released whichever way the ad ends.

function hooks() {
  const calls: string[] = [];
  const portal: Portal = {
    ...NO_PORTAL,
    loaded: () => calls.push('loaded'),
    gameplayStart: () => calls.push('gameplayStart'),
    gameplayStop: () => calls.push('gameplayStop'),
    celebrate: () => calls.push('celebrate'),
  };
  // the shell hides it on every screen but the lobby (a no-op when down): changes only are recorded
  let up = false;
  const banner: Banner = {
    height: 50,
    show: async () => {
      if (!up) calls.push('banner up');
      return (up = true);
    },
    hide: () => {
      if (up) calls.push('banner down');
      up = false;
    },
  };
  return { calls, portal, banner };
}

describe('the shell and the host hooks', () => {
  it('shows the banner only in the lobby, and says loaded before the first gameplay', async () => {
    const h = hooks();
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), portal: h.portal, banner: h.banner });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(h.calls).toEqual(['loaded', 'banner up']);
    // the lobby's band is kept clear while the banner is up
    h.calls.length = 0;
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    expect(h.calls).toEqual(['banner down', 'gameplayStart']);
    h.calls.length = 0;
    endRun(rig, 'lost');
    await rig.until(() => rig.shell.place() === 'results');
    expect(h.calls).toEqual(['gameplayStop']);
    expect(h.calls).not.toContain('banner up');
    await rig.tick(30);
    // the way back reads Collect with a haul waiting
    const collect = rig.texts().find((x) => x.startsWith(t('results.collect', { n: 0 }).split('0')[0]));
    if (collect) tapLabel(rig.app.stage, 'results.collect', { n: Number(/\d+/.exec(collect)![0]) });
    else tapLabel(rig.app.stage, 'results.lobby');
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(h.calls.filter((c) => c.startsWith('banner'))).toEqual(['banner up']);
    expect(rig.faults).toEqual([]);
  });

  it('opens the first run with loaded before gameplayStart and no banner', async () => {
    const h = hooks();
    const rig = await rigShell({ portal: h.portal, banner: h.banner });
    await rig.shell.start();
    await rig.tick(3);
    expect(rig.shell.place()).toBe('run');
    expect(h.calls).toEqual(['loaded', 'gameplayStart']);
    expect(rig.faults).toEqual([]);
  });

  it('holds the sound from an ad\'s start until it ends, paid, unpaid or thrown', async () => {
    let release: (paid: boolean) => void = () => {};
    let fail: (e: Error) => void = () => {};
    let startAd: () => void = () => {};
    const ads: Ads = {
      rewardedAvailable: async () => true,
      rewarded: (started) => new Promise((resolve, reject) => {
        startAd = () => started?.();
        release = resolve;
        fail = reject;
      }),
      midgame: async () => {},
      adFree: () => false,
    };
    const rig = await rigShell({ ads });
    const sound = rig.shell.sound as unknown as { holds: Set<string> };
    const muted = rig.shell.sound.muteDuring(ads);
    for (const end of [() => release(true), () => release(false), () => fail(new Error('host'))]) {
      const ad = muted.rewarded().catch(() => false);
      expect(sound.holds.has('ad')).toBe(false);
      startAd();
      expect(sound.holds.has('ad')).toBe(true);
      end();
      await ad;
      expect(sound.holds.has('ad')).toBe(false);
    }
    // an ad that never comes on screen never silences the game
    const unfilled = muted.rewarded();
    expect(sound.holds.has('ad')).toBe(false);
    release(false);
    await unfilled;
  });
});
