import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserGlobals, watchAd } from '../../testkit/adHosts';
import { pacedAds } from '../adPacing';
import { FAKE_ADS, NO_ADS, NO_BANNER, NO_PORTAL } from '../types';
import { BANNER_ID } from './banner';
import { WebPlatform } from './WebPlatform';

// The browser host's ads: none on a plain page, and the dev stand-in (?ads=fake) with its grey
// banner box, which the other hosts' flows are modelled on.

let browser: ReturnType<typeof browserGlobals>;

function platform(search = '') {
  browser = browserGlobals(search);
  vi.stubGlobal('location', browser.location);
  vi.stubGlobal('document', browser.document);
  vi.stubGlobal('window', browser.window);
  return new WebPlatform();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WebPlatform ads', () => {
  it('has no ads, banner or portal on a plain page', async () => {
    const p = platform();
    expect([p.ads, p.banner, p.portal]).toEqual([NO_ADS, NO_BANNER, NO_PORTAL]);
    const ad = watchAd((s) => p.ads.rewarded(s));
    expect([await ad.result, ad.starts()]).toEqual([false, 0]);
    expect(await p.banner.show()).toBe(false);
  });

  it('fakes a rewarded ad under ?ads=fake: on screen, then paid once', async () => {
    const p = platform('?ads=fake');
    expect(p.ads).toBe(FAKE_ADS);
    expect(await p.ads.rewardedAvailable()).toBe(true);
    const ad = watchAd((s) => p.ads.rewarded(s));
    expect(ad.onScreen()).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect([await ad.result, ad.starts(), ad.lateStarts()]).toEqual([true, 1, 0]);
  });

  it('fakes an interstitial only when pacing says it is due', async () => {
    const ads = pacedAds(platform('?ads=fake').ads, 60_000);
    const early = watchAd((s) => ads.midgame(s));
    await early.result;
    expect(early.starts()).toBe(0);
    ads.played(60_000);
    const due = watchAd((s) => ads.midgame(s));
    expect(due.onScreen()).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    await due.result;
    expect([due.onScreen(), ads.due()]).toEqual([false, false]);
  });

  it('puts the grey banner box up for the lobby and takes it down on leaving', async () => {
    const p = platform('?ads=fake');
    expect(await p.banner.show()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    const box = browser.banner(BANNER_ID);
    expect([box?.style.display, box?.textContent]).toEqual(['block', 'AD 320x50']);
    p.banner.hide();
    expect([box?.style.display, box?.textContent]).toEqual(['none', '']);
    // a hide while show still waits keeps it down
    const late = p.banner.show();
    p.banner.hide();
    expect(await late).toBe(false);
    expect(box?.style.display).toBe('none');
  });
});
