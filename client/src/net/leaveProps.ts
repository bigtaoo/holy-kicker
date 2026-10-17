import type { SimState } from '@hk/engine';
import type { PropValue } from '@hk/protocol';
import type { Attention } from '../platform/types';
import type { TutorialStep } from '../ui/tutorial';

// What a `leave` in a run carries beyond the place (server/src/protocol.ts): how far into the
// run the player got, so a quit in the first minute says whether it came after a few card
// choices, on one left open, or before the player ever moved; on the first run in a browser also
// whether the game ever had the keys and saw any key or click, which tells a player who could not
// steer (a portal's iframe keeps the keys until a click) from one who did not want to. Pure: the
// shell passes the state.

/** The run's part of a `leave`: chapter, wave, hero level, kills, an open card choice and (first run) the tutorial step and attention. */
export function runLeave(s: SimState, chapter: number, kills: number, tutorial: TutorialStep | null, seen?: Attention): Record<string, PropValue> {
  const p = s.players[0];
  const run = { chapter, wave: Math.max(1, s.wave), level: p.level, kills, card: p.offer.length > 0 };
  if (!tutorial) return run;
  return seen ? { ...run, tutorial, focus: seen.focus, input: seen.input } : { ...run, tutorial };
}
