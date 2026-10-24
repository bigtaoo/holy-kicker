import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserGlobals, fakeCrazyGames, watchAd } from '../../testkit/adHosts';
import { pacedAds } from '../adPacing';
import { AD_PLAY_MS, AD_START_MS } from '../adTimeout';
import { BANNER_ID, BANNER_REFRESH_MS } from '../web/banner';
import { CrazyGamesPlatform } from './CrazyGamesPlatform';
import { CrazyGamesSdk } from './sdk';

// The CrazyGames host's ads, banner and portal hooks, against a fake SDK v3 (testkit/adHosts.ts).

let browser: ReturnType<typeof browserGlobals>;

async function platform(o: Parameters<typeof fakeCrazyGames>[0] = {}) {
  const host = fakeCrazyGames(o);
  // init's own waits on a clock that moves only when it sleeps; ads and banners run on vi's timers
  let t = 0;
  const sdk = new CrazyGamesSdk({ CrazyGames: { SDK: host.sdk } }, () => t, async (ms) => void (t += ms));
  const p = await CrazyGamesPlatform.create(sdk);
  return { host, p };
}

beforeEach(() => {
  vi.useFakeTimers();
  browser = browserGlobals();
  vi.stubGlobal('location', browser.location);
  vi.stubGlobal('document', browser.document);
  vi.stubGlobal('window', browser.window);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CrazyGamesPlatform ads', () => {
  it('pays a rewarded ad once, only when finished, held from adStarted to the end', async () => {
    const { host, p } = await platform();
    expect(await p.ads.rewardedAvailable()).toBe(true);
    const ad = watchAd((s) => p.ads.rewarded(s));
    expect(host.requests.map((r) => r.type)).toEqual(['rewarded']);
    host.started();
    expect(ad.onScreen()).toBe(true);
    host.finished();
    expect(await ad.result).toBe(true);
    host.finished();
    host.started();
    expect([ad.starts(), ad.lateStarts()]).toEqual([1, 0]);
  });

  it('pays nothing for an ad unfilled, failed or closed early, and lets the game go', async () => {
    const { host, p } = await platform();
    const unfilled = watchAd((s) => p.ads.rewarded(s));
    host.error('unfilled');
    expect([await unfilled.result, unfilled.starts()]).toEqual([false, 0]);
    const closed = watchAd((s) => p.ads.rewarded(s));
    host.started();
    host.error('closed');
    expect([await closed.result, closed.onScreen()]).toEqual([false, false]);
    // an error after the finish changes nothing
    const paid = p.ads.rewarded();
    host.finished();
    host.error('late');
    expect(await paid).toBe(true);
  });

  it('gives up an ad that never starts or never ends, and ignores its late callbacks', async () => {
    const { host, p } = await platform();
    const silent = watchAd((s) => p.ads.rewarded(s));
    const silentRequest = host.requests.at(-1);
    await vi.advanceTimersByTimeAsync(AD_START_MS);
    expect(await silent.result).toBe(false);
    const stuck = watchAd((s) => p.ads.rewarded(s));
    host.started();
    await vi.advanceTimersByTimeAsync(AD_PLAY_MS);
    expect([await stuck.result, stuck.onScreen()]).toEqual([false, false]);
    // callbacks are per request, so the first one's late ones reach nothing else
    const next = watchAd((s) => p.ads.rewarded(s));
    silentRequest?.cb.adStarted?.();
    silentRequest?.cb.adFinished?.();
    expect([silent.lateStarts(), stuck.lateStarts(), next.settled(), next.starts()]).toEqual([0, 0, false, 0]);
    host.error();
    expect(await next.result).toBe(false);
  });

  it('plays a break ad only when pacing says so, and none in Basic Launch', async () => {
    const { host, p } = await platform();
    const ads = pacedAds(p.ads, 60_000);
    await ads.midgame();
    expect(host.requests).toEqual([]);
    ads.played(60_000);
    const ad = watchAd((s) => ads.midgame(s));
    host.started();
    expect(ad.onScreen()).toBe(true);
    host.finished();
    await ad.result;
    expect([host.requests.map((r) => r.type), ads.due()]).toEqual([['midgame'], false]);

    const basic = await platform({ basicLaunch: true });
    await basic.p.ads.midgame();
    expect(basic.host.requests).toEqual([]);
  });

  it('pays Basic Launch players at once with no ad, and offers nothing under an adblocker', async () => {
    const basic = await platform({ basicLaunch: true });
    expect([basic.p.basicLaunch(), await basic.p.ads.rewardedAvailable(), await basic.p.ads.rewarded()]).toEqual([true, true, true]);
    expect(basic.host.requests).toEqual([]);
    const blocked = await platform({ adblock: true });
    expect(await blocked.p.ads.rewardedAvailable()).toBe(false);
  });
});

describe('CrazyGamesPlatform banner and portal', () => {
  it('puts the banner up for the lobby and clears it on leaving, once per refresh floor', async () => {
    const { host, p } = await platform();
    expect(await p.banner.show()).toBe(true);
    expect(browser.banner(BANNER_ID)?.style.display).toBe('block');
    p.banner.hide();
    expect(browser.banner(BANNER_ID)?.style.display).toBe('none');
    // back in the lobby within 30 s: up at once, filled once the floor is over
    await p.banner.show();
    expect(host.calls.filter((c) => c.startsWith('banner'))).toEqual([`banner ${BANNER_ID} 320x50`]);
    await vi.advanceTimersByTimeAsync(BANNER_REFRESH_MS);
    expect(host.calls.filter((c) => c.startsWith('banner'))).toHaveLength(2);
    expect(host.calls).toContain(`clear ${BANNER_ID}`);
  });

  it('shows no banner in Basic Launch or under an adblocker', async () => {
    for (const o of [{ basicLaunch: true }, { adblock: true }]) {
      const { host, p } = await platform(o);
      expect(await p.banner.show()).toBe(false);
      expect(host.calls.some((c) => c.startsWith('banner'))).toBe(false);
    }
  });

  it('brackets loading and gameplay and celebrates through the SDK', async () => {
    const { host, p } = await platform();
    expect(host.calls).toEqual(['loadingStart']);
    p.portal.loaded();
    p.portal.gameplayStart();
    p.portal.gameplayStop();
    p.portal.celebrate();
    expect(host.calls).toEqual(['loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop', 'happytime']);
    expect(p.host).toBe('crazygames');
  });

  it('reports the developer preview as web', async () => {
    expect((await platform({ environment: 'local' })).p.host).toBe('web');
  });
});
