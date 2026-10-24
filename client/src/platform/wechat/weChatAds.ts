import { AD_PLAY_MS, AD_START_MS, AdTimedOut, StrayAd, within } from '../adTimeout';
import { NO_ADS, type Ads } from '../types';
import UNITS from './adUnits.json';

// WeChat's own ads (流量主, docs/wechat-ads.md) as the game's `Ads`: a rewarded video and an
// interstitial, one of each for the whole game, with their unit ids from adUnits.json. While an id
// is empty that kind is off, and with both empty the host has NO_ADS. Each ad loads itself when
// made and again after each close; a rewarded offer shows once one is loaded (rewardedAvailable
// waits a while for the first), and an interstitial that is not loaded is skipped, never waited for.

/** How long `rewardedAvailable` waits for the rewarded video to load. */
export const LOAD_WAIT_MS = 10_000;

export interface AdUnits {
  rewarded: string;
  interstitial: string;
}

export type AdApi = Pick<Wx, 'createRewardedVideoAd' | 'createInterstitialAd'>;

/** The host's ads: WeChatAds where a unit id is set and the base library has the API, else NO_ADS. */
export function weChatAds(api: AdApi, units: AdUnits = UNITS): Ads {
  const rewarded = units.rewarded && typeof api.createRewardedVideoAd === 'function';
  const interstitial = units.interstitial && typeof api.createInterstitialAd === 'function';
  return rewarded || interstitial ? new WeChatAds(api, units) : NO_ADS;
}

/** One ad kind: whether one is loaded, and the close the ad on screen is waiting for. */
class Slot<Close> {
  ready = false;
  private closed: ((res?: Close) => void) | null = null;
  private wake: (() => void)[] = [];
  /** An ad given up that may still come on screen or close: no other show over it, and its late
   *  close goes to no later ad (adTimeout.ts). */
  private readonly stray = new StrayAd();

  constructor(readonly ad: WxAd<Close>) {
    ad.onLoad(() => {
      this.ready = true;
      for (const w of this.wake.splice(0)) w();
    });
    ad.onError(() => {
      this.ready = false;
      for (const w of this.wake.splice(0)) w();
    });
    ad.onClose((res) => {
      this.ready = false;
      this.stray.clear();
      const done = this.closed;
      this.closed = null;
      done?.(res);
    });
  }

  /** Waits up to `ms` for an ad to be loaded. */
  async loaded(ms: number): Promise<boolean> {
    if (this.ready) return true;
    const answer = new Promise<void>((w) => {
      this.wake.push(w);
      setTimeout(w, ms);
    });
    this.ad.load().then(() => (this.ready = true), () => undefined);
    await answer;
    return this.ready;
  }

  /** Shows the ad; undefined when none could come on screen, else what its close said. */
  async play(started?: () => void, retry = true): Promise<{ res?: Close } | undefined> {
    if (this.closed || this.stray.active()) return undefined;
    const close = new Promise<Close | undefined>((r) => (this.closed = r));
    try {
      // a show that never answers is given up like a failed one (adTimeout.ts)
      await within(this.ad.show(), AD_START_MS);
    } catch (e) {
      this.closed = null;
      // one that may still come on screen is never shown a second time
      if (e instanceof AdTimedOut) return this.giveUp();
      if (!retry) {
        // for the next break
        void this.ad.load().catch(() => undefined);
        return undefined;
      }
      try {
        await within(this.ad.load(), AD_START_MS);
      } catch {
        return undefined;
      }
      return this.play(started, false);
    }
    started?.();
    try {
      return { res: await within(close, AD_PLAY_MS) };
    } catch {
      this.closed = null;
      return this.giveUp();
    }
  }

  private giveUp(): undefined {
    this.stray.mark();
    return undefined;
  }
}

export class WeChatAds implements Ads {
  private readonly video: Slot<{ isEnded?: boolean }> | null;
  private readonly interstitial: Slot<void> | null;

  constructor(api: AdApi, units: AdUnits) {
    this.video = units.rewarded && api.createRewardedVideoAd ? new Slot(api.createRewardedVideoAd({ adUnitId: units.rewarded })) : null;
    this.interstitial = units.interstitial && api.createInterstitialAd ? new Slot(api.createInterstitialAd({ adUnitId: units.interstitial })) : null;
  }

  async rewardedAvailable(): Promise<boolean> {
    return this.video ? this.video.loaded(LOAD_WAIT_MS) : false;
  }

  async rewarded(started?: () => void): Promise<boolean> {
    const shown = await this.video?.play(started);
    // a base library before 2.1.0 closes with no answer, only after the end
    return !!shown && (shown.res?.isEnded ?? true);
  }

  async midgame(started?: () => void): Promise<void> {
    await this.interstitial?.play(started, false);
  }

  adFree(): boolean {
    return false;
  }
}
