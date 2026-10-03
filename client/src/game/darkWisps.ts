// Timing of the dark wisps rising off the empowered boss: each wisp loops on its own phase,
// rising from the hips to over the head while it swells, sways and fades in and out.
// Positions are in units of the figure's height, measured from its feet (y up is negative).

export const WISPS = 8;
/** Seconds one wisp takes to rise. */
export const WISP_RISE = 1.8;

export interface WispPose {
  x: number;
  y: number;
  alpha: number;
  scale: number;
}

/** Wisp i of WISPS at `time` seconds. */
export function wispPose(i: number, time: number): WispPose {
  const u = (((time / WISP_RISE + i / WISPS) % 1) + 1) % 1;
  // alternate sides, spread across the body's width
  const side = i % 2 ? 1 : -1;
  const lane = 0.12 + ((i * 5) % WISPS) / WISPS * 0.22;
  return {
    x: side * lane + Math.sin((u + i * 0.37) * Math.PI * 2) * 0.05,
    y: -0.25 - u * 0.85,
    alpha: Math.sin(u * Math.PI),
    scale: 0.6 + u * 0.7,
  };
}

/** The haze's breathing, 0..1, at `time` seconds. */
export function hazePulse(time: number): number {
  return 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * 0.7);
}
