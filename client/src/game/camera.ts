// Comfort motion: the hero eases into and out of a run, and the camera eases after the hero,
// so the whole ground never starts or stops in a single frame. Pure maths, used by Game.ts.

export interface Vec {
  x: number;
  y: number;
}

export interface CameraParams {
  /** Seconds for the hero to cover ~63% of a change in speed; 0 is instant. */
  heroEase: number;
  /** Seconds for the camera to cover ~63% of the gap to the hero; 0 locks on. */
  camEase: number;
}

export const SMOOTH_CAMERA: CameraParams = { heroEase: 0.07, camEase: 0.1 };
export const LOCKED_CAMERA: CameraParams = { heroEase: 0, camEase: 0 };

/** Moves `v` toward `target` with time constant `ease`, independent of frame rate. */
export function ease(v: Vec, tx: number, ty: number, dt: number, ease: number): void {
  const k = ease > 0 ? 1 - Math.exp(-dt / ease) : 1;
  v.x += (tx - v.x) * k;
  v.y += (ty - v.y) * k;
}

/** Rounds a screen offset to whole device pixels so the ground does not shimmer as it scrolls. */
export function snapToPixel(v: number, resolution: number): number {
  return Math.round(v * resolution) / resolution;
}

/**
 * Which way a figure faces (1 right, -1 left) given the target's offset `dx`. Inside the dead
 * zone it keeps its side, so a mob standing right above or below the hero does not flicker.
 */
export function faceSide(prev: number, dx: number, dead: number): number {
  if (dx > dead) return 1;
  if (dx < -dead) return -1;
  return prev;
}

// The world has no edge, but the ground, its mist and its props are each one finite field.
// They follow the camera in whole periods of their pattern, so the jump never shows.

/** The start of the period of length `span` that holds `c`. */
export function periodStart(c: number, span: number): number {
  return Math.floor(c / span) * span;
}

/** `x` moved by whole periods into the window of length `period` centred on `c`. */
export function wrapNear(x: number, c: number, period: number): number {
  const d = (((x - c + period / 2) % period) + period) % period;
  return c + d - period / 2;
}
