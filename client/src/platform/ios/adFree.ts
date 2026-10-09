import type { Ads } from '../types';

// The ad-free card's perk (docs/ios.md "The ad-free card"): with the card owned, every rewarded
// offer is there and pays at once with no ad, and no interstitial plays. Only the waiting goes:
// the daily caps (3 ad chests, 2 quick patrols, …) stay as they are, so balance never has to
// price in a paying player. Ownership is read on every call, so a purchase, a restore or a refund
// takes effect at the next offer.
export function adFree(ads: Ads, owned: () => boolean): Ads {
  return {
    rewardedAvailable: () => (owned() ? Promise.resolve(true) : ads.rewardedAvailable()),
    rewarded: (started) => (owned() ? Promise.resolve(true) : ads.rewarded(started)),
    midgame: (started) => (owned() ? Promise.resolve() : ads.midgame(started)),
    adFree: owned,
  };
}
