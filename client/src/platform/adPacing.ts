import type { Ads } from './types';

// One pacing rule for every host's interstitials (docs/design.md "Ads"): at most one every
// `gapMs` of play, where play is the time a run is ticking on screen (Shell.tick feeds it), so
// a player browsing the lobby or sitting on the results earns no interstitial. The clock starts
// at launch at zero, and an ad that went on screen, an interstitial or a rewarded one the player
// chose, starts it over. An interstitial asked for before it is due is skipped. The host's own
// limits stay on top (CrazyGames' SDK and Playgama's Bridge refuse one inside their cooldowns);
// iOS AdMob has none of its own, so this is its only cap. Pure: no clock, no Pixi.

export interface PacedAds extends Ads {
  /** `ms` of play went by. */
  played(ms: number): void;
  /** Whether the next interstitial would be shown. */
  due(): boolean;
}

export function pacedAds(ads: Ads, gapMs: number): PacedAds {
  let since = 0;
  const shown = (started?: () => void) => () => {
    since = 0;
    started?.();
  };
  return {
    rewardedAvailable: () => ads.rewardedAvailable(),
    rewarded: (started) => ads.rewarded(shown(started)),
    midgame: async (started) => {
      if (since < gapMs) return;
      await ads.midgame(shown(started));
    },
    adFree: () => ads.adFree(),
    played: (ms) => {
      if (ms > 0) since += ms;
    },
    due: () => since >= gapMs,
  };
}
