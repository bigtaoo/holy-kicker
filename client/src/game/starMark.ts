import { BALANCE } from '../meta/balance';

// The three-star tick on the hero's health bar (healthBar.ts, docs/design.md "Stars"): shown on a
// normal chapter run while its lowest health has stayed at or above the threshold, fading out
// for good once it went under (a revive always does: going down is 0 %).

/** Seconds the tick takes to fade once the third star is lost. */
export const MARK_FADE = 0.5;

/** The threshold to mark for a run (BALANCE.stars.lowest), percent, or null for a run that wins no stars (hard mode, a challenge, the sandbox). */
export function starMarkAt(run: { waves: number; hard?: boolean; mutator?: unknown }): number | null {
  return run.waves > 0 && !run.hard && !run.mutator ? BALANCE.stars.lowest : null;
}

/** The tick's alpha after `dt` seconds, from `alpha`, with the run's `lowest` health against `at`. */
export function starMarkAlpha(alpha: number, dt: number, lowest: number, at: number): number {
  return lowest >= at ? 1 : Math.max(0, alpha - dt / MARK_FADE);
}
