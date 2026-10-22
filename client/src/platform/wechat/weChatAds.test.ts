import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ADS } from '../types';
import { LOAD_WAIT_MS, WeChatAds, weChatAds, type AdApi } from './weChatAds';

// A WeChat ad as the base library hands it out: it loads itself when made, `show` rejects while
// none is loaded, and the close says whether a video was watched to the end.
class FakeAd<Close> implements WxAd<Close> {
  loaded = false;
  fill = true;
  shows = 0;
  private onLoads: (() => void)[] = [];
  private onCloses: ((res?: Close) => void)[] = [];

  load(): Promise<void> {
    if (!this.fill) return Promise.reject(new Error('no fill'));
    this.loaded = true;
    for (const cb of this.onLoads) cb();
    return Promise.resolve();
  }
  show(): Promise<void> {
    if (!this.loaded) return Promise.reject(new Error('not loaded'));
    this.shows++;
    return Promise.resolve();
  }
  onLoad(cb: () => void): void {
    this.onLoads.push(cb);
  }
  onError(): void {}
  onClose(cb: (res?: Close) => void): void {
    this.onCloses.push(cb);
  }
  close(res?: Close): void {
    this.loaded = false;
    for (const cb of this.onCloses) cb(res);
  }
}

function host() {
  const video = new FakeAd<{ isEnded?: boolean }>();
  const inter = new FakeAd<void>();
  const api: AdApi = { createRewardedVideoAd: () => video, createInterstitialAd: () => inter };
  return { video, inter, ads: new WeChatAds(api, { rewarded: 'adunit-r', interstitial: 'adunit-i' }) };
}

describe('weChatAds', () => {
  it('is NO_ADS while no unit id is set or the base library has no ads', () => {
    const api: AdApi = { createRewardedVideoAd: () => new FakeAd(), createInterstitialAd: () => new FakeAd() };
    expect(weChatAds(api, { rewarded: '', interstitial: '' })).toBe(NO_ADS);
    expect(weChatAds({}, { rewarded: 'r', interstitial: 'i' })).toBe(NO_ADS);
    expect(weChatAds(api, { rewarded: 'r', interstitial: '' })).toBeInstanceOf(WeChatAds);
  });
});

describe('WeChatAds', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pays a video watched to the end, not one closed early', async () => {
    const { video, ads } = host();
    expect(await ads.rewardedAvailable()).toBe(true);
    const started = vi.fn();
    const first = ads.rewarded(started);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toHaveBeenCalledOnce();
    video.close({ isEnded: true });
    expect(await first).toBe(true);
    // the next one loads on show; closed early it pays nothing
    const second = ads.rewarded();
    await vi.advanceTimersByTimeAsync(0);
    video.close({ isEnded: false });
    expect(await second).toBe(false);
    // an old base library closes with no answer, only at the end
    const third = ads.rewarded();
    await vi.advanceTimersByTimeAsync(0);
    video.close();
    expect(await third).toBe(true);
  });

  it('offers no video when none loads, and pays nothing when none can show', async () => {
    const { video, ads } = host();
    video.fill = false;
    const offer = ads.rewardedAvailable();
    await vi.advanceTimersByTimeAsync(LOAD_WAIT_MS);
    expect(await offer).toBe(false);
    const started = vi.fn();
    expect(await ads.rewarded(started)).toBe(false);
    expect(started).not.toHaveBeenCalled();
  });

  it('skips an interstitial that is not loaded and loads one for the next break', async () => {
    const { inter, ads } = host();
    const started = vi.fn();
    await ads.midgame(started);
    expect(started).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(inter.loaded).toBe(true);
    const shown = ads.midgame(started);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toHaveBeenCalledOnce();
    inter.close();
    await shown;
    expect(inter.shows).toBe(1);
  });
});
