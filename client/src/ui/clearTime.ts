import { TICK_RATE } from '@hk/engine';

// A run's clock as the boards measure it: simulated time in tenths of a second, so pauses, the
// level-up cards and ads do not count and fast-forward runs it faster. The results screen shows a
// won run's time against the player's best; the HUD shows a small running clock, but only where
// time already matters (a chapter cleared before on that track, or a challenge), never on a
// chapter's first tries, where staying alive is all. Pure.

/** Tenths of a second after `tick` ticks of the simulation. */
export function tenthsOf(tick: number): number {
  return Math.round((tick * 10) / TICK_RATE);
}

/** m:ss.t, the boards' format. */
export function clockTenths(tenths: number): string {
  return `${clockSecs(tenths)}.${Math.floor(tenths) % 10}`;
}

/** m:ss, the tenths dropped (the HUD's clock). */
export function clockSecs(tenths: number): string {
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Whether the HUD shows the clock: on a chapter cleared before on this track, or in a challenge. */
export function timerShown(cleared: boolean, challenge: boolean): boolean {
  return cleared || challenge;
}

/** The whole seconds the HUD's clock shows at `tick`: its text changes only when this does. */
export function shownSecond(tick: number): number {
  return Math.floor(tick / TICK_RATE);
}

/** How a won run's time compares with the best before it (0 for none): faster by `s` seconds, or the best that stands. */
export type TimeVerdict = { kind: 'faster'; s: string } | { kind: 'stands'; best: string } | null;

export function verdict(tenths: number, best: number): TimeVerdict {
  if (best <= 0) return null;
  if (tenths < best) {
    const d = best - tenths;
    return { kind: 'faster', s: `${Math.floor(d / 10)}.${d % 10}` };
  }
  return { kind: 'stands', best: clockTenths(best) };
}
