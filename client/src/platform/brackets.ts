import type { Portal } from './types';

/**
 * The portal with its gameplay brackets deduplicated: gameplayStart and gameplayStop reach the
 * host only when the state really changes. Several screens can end the same stretch of play (a
 * pause, then giving up from it), and CrazyGames reads repeated stops as noise in its stats.
 */
export function bracketed(portal: Portal): Portal {
  let playing = false;
  return {
    loaded: () => portal.loaded(),
    gameplayStart: () => {
      if (playing) return;
      playing = true;
      portal.gameplayStart();
    },
    gameplayStop: () => {
      if (!playing) return;
      playing = false;
      portal.gameplayStop();
    },
    celebrate: () => portal.celebrate(),
    userName: () => portal.userName(),
  };
}
