import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMOB_ON, browserGlobals, fakeHkNative, watchAd } from '../../testkit/adHosts';
import { pacedAds } from '../adPacing';
import { AD_PLAY_MS } from '../adTimeout';
import { NO_BANNER } from '../types';
import { START_WAIT_MS } from './admob';
import { IosPlatform } from './IosPlatform';

// The iOS app's ads as the shell sees them: AdMob through window.HKNative (testkit/adHosts.ts),
// under the ad-free card's decorator, including events that come late or never.

function platform(initial = ADMOB_ON) {
  const shell = fakeHkNative(initial);
  return { shell, p: new IosPlatform(shell.native) };
}

beforeEach(() => {
  vi.useFakeTimers();
  const b = browserGlobals();
  vi.stubGlobal('location', b.location);
  vi.stubGlobal('document', b.document);
  vi.stubGlobal('window', b.window);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('IosPlatform ads', () => {
  it('pays a rewarded ad once when earned, held from started to done', async () => {
    const { shell, p } = platform();
    expect(await p.ads.rewardedAvailable()).toBe(true);
    const ad = watchAd((s) => p.ads.rewarded(s));
    expect(shell.shown).toEqual(['rewarded']);
    shell.started('rewarded');
    expect(ad.onScreen()).toBe(true);
    shell.done('rewarded', true);
    expect(await ad.result).toBe(true);
    shell.done('rewarded', true);
    shell.started('rewarded');
    expect([ad.starts(), ad.lateStarts()]).toEqual([1, 0]);
  });

  it('pays nothing for an ad skipped or failing before it starts', async () => {
    const { shell, p } = platform();
    const skipped = watchAd((s) => p.ads.rewarded(s));
    shell.started('rewarded');
    shell.done('rewarded', false);
    expect(await skipped.result).toBe(false);
    const failed = watchAd((s) => p.ads.rewarded(s));
    shell.done('rewarded', false);
    expect(await failed.result).toBe(false);
    expect(failed.starts()).toBe(0);
  });

  it('offers no ad the shell has not loaded, and none while ads are off', async () => {
    const { shell, p } = platform({ ...ADMOB_ON, rewarded: false, interstitial: false });
    expect(await p.ads.rewarded()).toBe(false);
    await p.ads.midgame();
    expect(shell.shown).toEqual([]);
    const off = platform({ ...ADMOB_ON, status: 'off', rewarded: false });
    expect(await off.p.ads.rewardedAvailable()).toBe(false);
  });

  it('gives up an ad that never starts, and its late start and end do nothing', async () => {
    const { shell, p } = platform();
    const ad = watchAd((s) => p.ads.rewarded(s));
    await vi.advanceTimersByTimeAsync(START_WAIT_MS);
    expect(await ad.result).toBe(false);
    shell.started('rewarded');
    shell.done('rewarded', true);
    expect([ad.starts(), ad.lateStarts()]).toEqual([0, 0]);
  });

  it('never pays the next ad with a given-up ad\'s late end, nor shows one over it', async () => {
    const { shell, p } = platform();
    const first = p.ads.rewarded();
    await vi.advanceTimersByTimeAsync(START_WAIT_MS);
    expect(await first).toBe(false);
    // asked again while the shell, slow, is still putting the first on screen
    const second = watchAd((s) => p.ads.rewarded(s));
    shell.started('rewarded');
    shell.done('rewarded', true);
    expect(await second.result).toBe(false);
    expect(second.starts()).toBe(0);
    expect(shell.shown).toEqual(['rewarded']);
    // its end came: ads work again
    const third = p.ads.rewarded();
    shell.started('rewarded');
    shell.done('rewarded', true);
    expect(await third).toBe(true);
  });

  it('lets the game go after AD_PLAY_MS on screen without an end, and pays nothing for it later', async () => {
    const { shell, p } = platform();
    const ad = watchAd((s) => p.ads.rewarded(s));
    shell.started('rewarded');
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    expect(await ad.result).toBe(false);
    expect(ad.onScreen()).toBe(false);
    const next = p.ads.rewarded();
    expect(await next).toBe(false);
    shell.done('rewarded', true);
    // a given-up ad that never ends is forgotten after AD_PLAY_MS more
    const lost = p.ads.rewarded();
    shell.started('rewarded');
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    expect(await lost).toBe(false);
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    const again = p.ads.rewarded();
    shell.started('rewarded');
    shell.done('rewarded', true);
    expect(await again).toBe(true);
  });

  it('plays an interstitial when pacing says so, its end not mistaken for a rewarded one', async () => {
    const { shell, p } = platform();
    const ads = pacedAds(p.ads, 60_000);
    await ads.midgame();
    expect(shell.shown).toEqual([]);
    ads.played(60_000);
    const ad = watchAd((s) => ads.midgame(s));
    shell.started('interstitial');
    shell.done('rewarded', true);
    expect(ad.onScreen()).toBe(true);
    shell.done('interstitial', false);
    await ad.result;
    expect([shell.shown, ads.due()]).toEqual([['interstitial'], false]);
  });

  it('has no banner and no portal hooks beyond Game Center', () => {
    const { p } = platform();
    expect(p.banner).toBe(NO_BANNER);
    expect(() => {
      p.portal.loaded();
      p.portal.gameplayStart();
      p.portal.gameplayStop();
      p.portal.celebrate();
    }).not.toThrow();
  });
});
