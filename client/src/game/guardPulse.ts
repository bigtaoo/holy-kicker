import { TICK_RATE } from '@hk/engine';

/** Pulses per second while the hero is untouchable. */
const PULSE_HZ = 3;
/** How far a pulse dims the hero at its deepest. */
const DEPTH = 0.45;

/**
 * The hero's alpha while untouchable (`hurtCd` ticks left, `alpha` of the way through the last
 * tick): a soft 3 Hz pulse rather than a hard strobe, timed from the end so it lands on full
 * opacity exactly when the guard runs out.
 */
export function guardAlpha(hurtCd: number, alpha: number): number {
  const left = Math.max(0, hurtCd - alpha) / TICK_RATE;
  if (left <= 0) return 1;
  return 1 - (DEPTH * (1 - Math.cos(2 * Math.PI * PULSE_HZ * left))) / 2;
}
