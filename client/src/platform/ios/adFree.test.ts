import { describe, expect, it } from 'vitest';
import type { Ads } from '../types';
import { adFree } from './adFree';

// The ad-free card's perk over the host's ads: no ad ever plays once it is owned.

function host() {
  const played: string[] = [];
  const ads: Ads = {
    rewardedAvailable: async () => false,
    rewarded: async (started) => {
      started?.();
      played.push('rewarded');
      return false;
    },
    midgame: async (started) => {
      started?.();
      played.push('midgame');
    },
    adFree: () => false,
  };
  return { ads, played };
}

describe('adFree', () => {
  it('passes everything to the host until the card is owned', async () => {
    const { ads, played } = host();
    const free = adFree(ads, () => false);
    expect(free.adFree()).toBe(false);
    expect(await free.rewardedAvailable()).toBe(false);
    expect(await free.rewarded()).toBe(false);
    await free.midgame();
    expect(played).toEqual(['rewarded', 'midgame']);
  });

  it('pays every reward at once with the card, and plays nothing', async () => {
    const { ads, played } = host();
    let owned = false;
    const free = adFree(ads, () => owned);
    owned = true;
    let started = 0;
    expect(free.adFree()).toBe(true);
    expect(await free.rewardedAvailable()).toBe(true);
    expect(await free.rewarded(() => started++)).toBe(true);
    await free.midgame(() => started++);
    // no ad came on screen, so nothing was muted
    expect(started).toBe(0);
    expect(played).toEqual([]);
  });
});
