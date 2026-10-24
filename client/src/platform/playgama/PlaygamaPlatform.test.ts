import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserGlobals, fakeBridge, watchAd } from '../../testkit/adHosts';
import { pacedAds } from '../adPacing';
import { AD_PLAY_MS, AD_START_MS } from '../adTimeout';
import { NO_BANNER, NO_PORTAL } from '../types';
import { PlaygamaBridge } from './bridge';
import { PlaygamaPlatform } from './PlaygamaPlatform';

// The Playgama host's ads, portal messages and pause, against a fake Bridge v2 (testkit/adHosts.ts).

async function platform(o: Parameters<typeof fakeBridge>[0] = {}) {
  const host = fakeBridge(o);
  const p = await PlaygamaPlatform.create(new PlaygamaBridge({ bridge: host.sdk }, () => new Promise(() => {})));
  return { host, p };
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

describe('PlaygamaPlatform ads', () => {
  it('pays a rewarded ad once, only after rewarded and closed, held from opened to the end', async () => {
    const { host, p } = await platform();
    expect(await p.ads.rewardedAvailable()).toBe(true);
    const ad = watchAd((s) => p.ads.rewarded(s));
    expect(host.shows).toEqual(['rewarded']);
    host.rewarded('loading');
    expect(ad.starts()).toBe(0);
    host.rewarded('opened');
    expect(ad.onScreen()).toBe(true);
    host.rewarded('rewarded', 'closed');
    expect(await ad.result).toBe(true);
    // a repeat of the end changes nothing
    host.rewarded('rewarded', 'closed');
    expect([ad.starts(), ad.lateStarts()]).toEqual([1, 0]);
  });

  it('pays nothing for an ad closed early, failed or unfilled, and always lets the game go', async () => {
    const { host, p } = await platform();
    for (const states of [['loading', 'opened', 'closed'], ['loading', 'failed'], ['failed'], ['opened', 'failed']]) {
      const ad = watchAd((s) => p.ads.rewarded(s));
      host.rewarded(...states);
      expect(await ad.result).toBe(false);
      expect(ad.onScreen()).toBe(false);
    }
  });

  it('ignores states out of order: a reward after the close, a close before it opened', async () => {
    const { host, p } = await platform();
    const late = watchAd((s) => p.ads.rewarded(s));
    host.rewarded('opened', 'closed', 'rewarded');
    expect(await late.result).toBe(false);
    const unopened = watchAd((s) => p.ads.rewarded(s));
    host.rewarded('closed', 'opened');
    expect(await unopened.result).toBe(false);
    expect(unopened.lateStarts()).toBe(0);
  });

  it('gives up an ad that never opens, and its late states do nothing', async () => {
    const { host, p } = await platform();
    const ad = watchAd((s) => p.ads.rewarded(s));
    await vi.advanceTimersByTimeAsync(AD_START_MS);
    expect(await ad.result).toBe(false);
    host.rewarded('opened', 'rewarded', 'closed');
    expect([ad.starts(), ad.lateStarts()]).toEqual([0, 0]);
  });

  it('gives up an ad on screen that never ends, unmuting the game, and pays nothing for it later', async () => {
    const { host, p } = await platform();
    const ad = watchAd((s) => p.ads.rewarded(s));
    host.rewarded('opened');
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    expect(await ad.result).toBe(false);
    expect(ad.onScreen()).toBe(false);
    host.rewarded('rewarded', 'closed');
    expect(ad.lateStarts()).toBe(0);
  });

  it('never pays the next ad with a given-up ad\'s late reward', async () => {
    const { host, p } = await platform();
    const first = watchAd((s) => p.ads.rewarded(s));
    await vi.advanceTimersByTimeAsync(AD_START_MS);
    expect(await first.result).toBe(false);
    // the player asks again while the first, given up, still plays somewhere
    const second = watchAd((s) => p.ads.rewarded(s));
    host.rewarded('opened', 'rewarded', 'closed');
    expect(await second.result).toBe(false);
    expect(second.starts()).toBe(0);
    // once the late one has closed, ads work again
    const third = watchAd((s) => p.ads.rewarded(s));
    host.rewarded('opened', 'rewarded', 'closed');
    expect(await third.result).toBe(true);
  });

  it('ends a rewarded ad only by its own states, never an interstitial\'s', async () => {
    const { host, p } = await platform();
    const ad = watchAd((s) => p.ads.rewarded(s));
    host.rewarded('opened', 'rewarded');
    host.interstitial('closed');
    expect(ad.onScreen()).toBe(true);
    host.rewarded('closed');
    expect(await ad.result).toBe(true);
  });

  it('forgets a given-up ad that never reports again after AD_PLAY_MS', async () => {
    const { host, p } = await platform();
    const first = p.ads.rewarded();
    await vi.advanceTimersByTimeAsync(AD_START_MS);
    expect(await first).toBe(false);
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    const next = p.ads.rewarded();
    host.rewarded('opened', 'rewarded', 'closed');
    expect(await next).toBe(true);
  });

  it('offers no rewarded ad under an adblocker or where Bridge has none', async () => {
    expect(await (await platform({ adblock: true })).p.ads.rewardedAvailable()).toBe(false);
    expect(await (await platform({ rewarded: false })).p.ads.rewardedAvailable()).toBe(false);
  });

  it('plays an interstitial when pacing says it is due, and none where Bridge has none', async () => {
    const { host, p } = await platform();
    const ads = pacedAds(p.ads, 60_000);
    await ads.midgame();
    expect(host.shows).toEqual([]);
    ads.played(60_000);
    const ad = watchAd((s) => ads.midgame(s));
    host.interstitial('loading', 'opened');
    expect(ad.onScreen()).toBe(true);
    host.interstitial('closed');
    await ad.result;
    expect(host.shows).toEqual(['interstitial']);
    // the one just shown starts the clock over
    expect(ads.due()).toBe(false);
    // a cooldown fails at once
    ads.played(60_000);
    const cooled = ads.midgame();
    host.interstitial('failed');
    await cooled;

    const none = await platform({ interstitial: false });
    await none.p.ads.midgame();
    expect(none.host.shows).toEqual([]);
  });
});

describe('PlaygamaPlatform portal', () => {
  it('sends the lifecycle messages, has no banner, and counts the platform pause as hidden', async () => {
    const { host, p } = await platform();
    p.portal.loaded();
    p.portal.gameplayStart();
    p.portal.gameplayStop();
    p.portal.celebrate();
    await vi.advanceTimersByTimeAsync(0);
    expect(host.messages).toEqual(['game_ready', 'gameplay_started', 'gameplay_stopped', 'player_got_achievement']);
    expect(p.banner).toBe(NO_BANNER);
    expect(p.host).toBe('playgama');
    const hidden = vi.fn();
    p.onHide(hidden);
    await vi.advanceTimersByTimeAsync(0);
    host.pause(false);
    host.pause(true);
    expect(hidden).toHaveBeenCalledOnce();
  });

  it('reports a local preview as web and stays offline only in the sandbox', async () => {
    const mock = await platform({ id: 'mock' });
    expect([mock.p.host, mock.p.backendBlocked, mock.p.analytics]).toEqual(['web', false, undefined]);
    const sandbox = await platform({ id: 'playgama_sandbox' });
    expect([sandbox.p.host, sandbox.p.backendBlocked]).toEqual(['playgama', true]);
    expect(sandbox.p.sessionProps()).toEqual({ sdk: 'playgama_sandbox/2.9.0' });
  });

  it('is the plain browser without Bridge: no portal, no ads', async () => {
    const p = await PlaygamaPlatform.create(new PlaygamaBridge({}));
    expect(p.portal).toBe(NO_PORTAL);
    expect(await p.ads.rewardedAvailable()).toBe(false);
    expect(await p.ads.rewarded()).toBe(false);
    expect(p.host).toBe('web');
  });
});
