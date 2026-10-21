import { BALANCE } from '../meta/balance';

// The three-star rim around the hero's health bar (healthBar.ts, docs/design.md "Stars"): a thin
// gold frame shown on a normal chapter run while its lowest health has stayed at or above the
// threshold, fading out for good once it went under (a revive always does: going down is 0 %),
// even if the hero heals back.

/** Seconds the rim takes to fade once the third star is lost. */
export const RIM_FADE = 0.5;

/** The three-star threshold for a run (BALANCE.stars.lowest), percent, or null for a run that wins no stars (hard mode, a challenge, the sandbox). */
export function starMarkAt(run: { waves: number; hard?: boolean; mutator?: unknown }): number | null {
  return run.waves > 0 && !run.hard && !run.mutator ? BALANCE.stars.lowest : null;
}

/** The rim's alpha after `dt` seconds, from `alpha`, with the run's `lowest` health against `at`. */
export function starRimAlpha(alpha: number, dt: number, lowest: number, at: number): number {
  return lowest >= at ? 1 : Math.max(0, alpha - dt / RIM_FADE);
}
