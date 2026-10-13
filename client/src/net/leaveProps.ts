import type { SimState } from '@hk/engine';
import type { PropValue } from '@hk/protocol';
import type { TutorialStep } from '../ui/tutorial';

// What a `leave` in a run carries beyond the place (server/src/protocol.ts): how far into the
// run the player got, so a quit in the first minute says whether it came after a few card
// choices, on one left open, or before the player ever moved. Pure: the shell passes the state.

/** The run's part of a `leave`: chapter, wave, hero level, kills, an open card choice and (first run) the tutorial step. */
export function runLeave(s: SimState, chapter: number, kills: number, tutorial: TutorialStep | null): Record<string, PropValue> {
  const p = s.players[0];
  const run = { chapter, wave: Math.max(1, s.wave), level: p.level, kills, card: p.offer.length > 0 };
  return tutorial ? { ...run, tutorial } : run;
}
