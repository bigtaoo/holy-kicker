import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeWx, watchAd } from '../../testkit/adHosts';
import { pacedAds } from '../adPacing';
import { AD_PLAY_MS, AD_START_MS } from '../adTimeout';
import { weChatAds } from './weChatAds';

// WeChat's ads as the shell sees them, on screen from `started` until settled, against the base
// library's fake ads (testkit/adHosts.ts): no fill, errors, shows and closes that come late or never.

const UNITS = { rewarded: 'adunit-r', interstitial: 'adunit-i' };

function host() {
  const wx = fakeWx();
  return { ...wx, ads: weChatAds(wx.api, UNITS) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('WeChat ad flows', () => {
  it('makes one ad of each kind for the whole game, with its unit id, loading one to show', async () => {
    const { ads, made, video } = host();
    for (const ended of [true, false]) {
      const ad = ads.rewarded();
      await vi.advanceTimersByTimeAsync(0);
      video.close({ isEnded: ended });
      expect(await ad).toBe(ended);
    }
    expect([made, video.shows]).toEqual([['adunit-r', 'adunit-i'], 2]);
  });

  it('pays a video once, watched to the end, held from show to close', async () => {
    const { ads, video } = host();
    expect(await ads.rewardedAvailable()).toBe(true);
    const ad = watchAd((s) => ads.rewarded(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(ad.onScreen()).toBe(true);
    video.close({ isEnded: true });
    expect(await ad.result).toBe(true);
    video.close({ isEnded: true });
    expect([ad.starts(), ad.lateStarts()]).toEqual([1, 0]);
  });

  it('pays nothing for a video closed early or that cannot load, and lets the game go', async () => {
    const { ads, video } = host();
    await video.load();
    const early = watchAd((s) => ads.rewarded(s));
    await vi.advanceTimersByTimeAsync(0);
    video.close({ isEnded: false });
    expect(await early.result).toBe(false);
    video.fill = false;
    const unfilled = watchAd((s) => ads.rewarded(s));
    expect(await unfilled.result).toBe(false);
    expect(unfilled.starts()).toBe(0);
    expect(await ads.rewardedAvailable()).toBe(false);
  });

  it('gives up a show that never answers without showing the ad a second time', async () => {
    const { ads, video } = host();
    await video.load();
    video.hang = true;
    const ad = watchAd((s) => ads.rewarded(s));
    await vi.advanceTimersByTimeAsync(AD_START_MS * 3);
    expect(await ad.result).toBe(false);
    expect(video.shows).toBe(1);
    // it comes on screen after all: no start, and its end pays no later ad
    video.answerShows();
    await vi.advanceTimersByTimeAsync(0);
    const next = watchAd((s) => ads.rewarded(s));
    expect(await next.result).toBe(false);
    video.close({ isEnded: true });
    expect([ad.starts(), next.starts(), video.shows]).toEqual([0, 0, 1]);
    // after its close, ads work again
    video.hang = false;
    await video.load();
    const third = ads.rewarded();
    await vi.advanceTimersByTimeAsync(0);
    video.close({ isEnded: true });
    expect(await third).toBe(true);
  });

  it('lets the game go after AD_PLAY_MS on screen without a close, and pays nothing for the late one', async () => {
    const { ads, video } = host();
    await video.load();
    const ad = watchAd((s) => ads.rewarded(s));
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    expect(await ad.result).toBe(false);
    expect(ad.onScreen()).toBe(false);
    const next = ads.rewarded();
    expect(await next).toBe(false);
    video.close({ isEnded: true });
    expect(video.shows).toBe(1);
  });

  it('forgets a given-up ad that never closes after AD_PLAY_MS', async () => {
    const { ads, video } = host();
    await video.load();
    video.hang = true;
    expect(await Promise.all([ads.rewarded(), vi.advanceTimersByTimeAsync(AD_START_MS)]).then(([r]) => r)).toBe(false);
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    video.hang = false;
    await video.load();
    const next = ads.rewarded();
    await vi.advanceTimersByTimeAsync(0);
    video.close({ isEnded: true });
    expect(await next).toBe(true);
  });

  it('plays an interstitial only when due and loaded, held until it closes', async () => {
    const { ads, interstitial } = host();
    const paced = pacedAds(ads, 60_000);
    paced.played(60_000);
    // not loaded: skipped, loaded for the next break
    await paced.midgame();
    expect([interstitial.shows, interstitial.loads > 0]).toEqual([0, true]);
    paced.played(60_000);
    const ad = watchAd((s) => paced.midgame(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(ad.onScreen()).toBe(true);
    interstitial.close();
    await ad.result;
    expect([interstitial.shows, paced.due()]).toEqual([1, false]);
  });
});
