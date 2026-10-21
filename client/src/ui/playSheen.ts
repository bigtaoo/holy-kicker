// The PLAY button's gloss (lobbyPlay.ts): a band of light that sweeps across its face now and
// then, so the one button that starts a run is also the one thing on the lobby that glints.

/** Seconds between sweeps, and how long one takes. */
export const SHEEN = { every: 3.2, sweep: 0.7 };

/**
 * Where the band is at `time` seconds, as a share of the way across the face: from just off its
 * left edge (-0.2) to just off its right (1.2) while sweeping, null while resting.
 */
export function sheenAt(time: number): number | null {
  const t = ((time % SHEEN.every) + SHEEN.every) % SHEEN.every;
  if (t >= SHEEN.sweep) return null;
  const k = t / SHEEN.sweep;
  // eased: quick through the middle, soft at the ends
  const e = k * k * (3 - 2 * k);
  return -0.2 + 1.4 * e;
}
