import { describe, expect, it } from 'vitest';
import { BALANCE } from '../meta/balance';
import { pacedAds } from './adPacing';
import type { Ads } from './types';

// The shared interstitial pacing: one at most every few minutes of play, whatever the host.

const MIN = 60_000;

/** A host whose ads always go on screen (`fill` false: none to show, `started` never called). */
function host(fill = true) {
  const asked = { midgame: 0, rewarded: 0 };
  const ads: Ads = {
    rewardedAvailable: async () => true,
    rewarded: async (started) => {
      asked.rewarded++;
      if (fill) started?.();
      return fill;
    },
    midgame: async (started) => {
      asked.midgame++;
      if (fill) started?.();
    },
    adFree: () => false,
  };
  return { ads, asked };
}

describe('pacedAds', () => {
  it('keeps the gap in balance.json, 3 minutes', () => {
    expect(BALANCE.ads.interstitialMinutes).toBe(3);
  });

  it('shows no interstitial before the first gap of play', async () => {
    const { ads, asked } = host();
    const paced = pacedAds(ads, 3 * MIN);
    await paced.midgame();
    paced.played(2 * MIN);
    await paced.midgame();
    expect(asked.midgame).toBe(0);
    paced.played(MIN);
    expect(paced.due()).toBe(true);
    await paced.midgame();
    expect(asked.midgame).toBe(1);
  });

  it('starts the clock over once one is shown', async () => {
    const { ads, asked } = host();
    const paced = pacedAds(ads, 3 * MIN);
    paced.played(10 * MIN);
    await paced.midgame();
    await paced.midgame();
    expect(asked.midgame).toBe(1);
    paced.played(3 * MIN - 1);
    await paced.midgame();
    expect(asked.midgame).toBe(1);
    paced.played(1);
    await paced.midgame();
    expect(asked.midgame).toBe(2);
  });

  it('counts a rewarded ad on screen as the last ad', async () => {
    const { ads, asked } = host();
    const paced = pacedAds(ads, 3 * MIN);
    paced.played(5 * MIN);
    let started = 0;
    expect(await paced.rewarded(() => started++)).toBe(true);
    expect(started).toBe(1);
    await paced.midgame();
    expect(asked.midgame).toBe(0);
  });

  it('asks again at the next break when the host had no ad to show', async () => {
    const { ads, asked } = host(false);
    const paced = pacedAds(ads, 3 * MIN);
    paced.played(3 * MIN);
    await paced.midgame();
    await paced.midgame();
    expect(asked.midgame).toBe(2);
    expect(paced.due()).toBe(true);
  });

  it('ignores a negative frame', () => {
    const paced = pacedAds(host().ads, 3 * MIN);
    paced.played(-5 * MIN);
    paced.played(3 * MIN);
    expect(paced.due()).toBe(true);
  });
});
