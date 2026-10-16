import type { Goal } from './deathInfo';

// The results screen's timing (ResultsScreen.ts): its parts come in one after another (the title
// and waves, then what felled the hero, then the rewards, then the rest and the buttons), each
// fading in as it rises a little, and the copper counts up. A tap shows it all at once. Pure maths.

export const REVEAL = {
  /** Seconds between one part and the next, and that each takes to come in. */
  step: 0.15,
  fade: 0.25,
  /** Logical units a part rises as it comes in. */
  rise: 40,
  /** Seconds the copper takes to count up, once the rewards are in. */
  count: 0.7,
};

/** An age past every part and count: what a tap skips to. */
export const REVEALED = 10;

/** How far part `i` (0 first) has come in `age` seconds after the screen opened, 0..1. */
export function partIn(age: number, i: number): number {
  const u = Math.min(1, Math.max(0, (age - i * REVEAL.step) / REVEAL.fade));
  return u * u * (3 - 2 * u);
}

/** The copper shown `age` seconds in, counting up to `total` from the moment part `i` starts. */
export function countUp(age: number, i: number, total: number): number {
  const u = Math.min(1, Math.max(0, (age - i * REVEAL.step) / REVEAL.count));
  // fast at first, settling on the total
  return Math.round(total * (1 - (1 - u) ** 3));
}

/** How full the goal bar is after `cleared` waves: the share of the way to the goal, full for a new best. */
export function goalShare(cleared: number, goal: Goal): number {
  if (goal.kind === 'record' || goal.n <= 0) return 1;
  return cleared / (cleared + goal.n);
}
