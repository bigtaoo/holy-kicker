// Soft ground props (grass, reeds, bushes) leaning in the wind and parting round the hero:
// view only, nothing in the sim knows about them. A lean is a horizontal shear in radians,
// positive to the right, applied with the prop's foot fixed (decoView.ts).

/** How far each soft kind gives: grass and reeds bend most, a pine barely. Other kinds stand still. */
export const SOFT: Readonly<Record<string, number>> = {
  grass_tuft: 1,
  reeds: 1.2,
  bush: 0.45,
  shrub: 0.55,
  pine: 0.25,
};

export const SWAY = {
  /** Lean of the steady breeze, and the gusts rolling over it. */
  breeze: 0.05,
  gust: 0.07,
  /** The hero parts the grass within this radius (world units), at most this lean at its foot. */
  reach: 150,
  push: 0.55,
  /** Ease rates, per second: quick to be pushed, slower to spring back. */
  bend: 16,
  recover: 4,
};

/** The wind's lean at `time` seconds for a prop at (x, y): a breeze plus gusts sweeping across the field. */
export function windLean(time: number, x: number, y: number): number {
  const breeze = Math.sin(time * 1.9 + x * 0.011 + y * 0.007);
  // a broad, slow wave travelling left to right, so a gust visibly runs through the field
  const gust = Math.max(0, Math.sin(time * 0.7 - x * 0.0016 - y * 0.0004));
  return SWAY.breeze * breeze + SWAY.gust * gust * gust;
}

/** The lean the hero at (hx, hy) gives a prop at (x, y): away from him, strongest close in. */
export function pushLean(x: number, y: number, hx: number, hy: number): number {
  const dx = x - hx;
  // grass is pressed by his feet, so a prop above him on screen is reached a little less
  const dy = (y - hy) * 1.3;
  const d2 = dx * dx + dy * dy;
  const r = SWAY.reach;
  if (d2 >= r * r) return 0;
  const k = 1 - Math.sqrt(d2) / r;
  const side = dx === 0 ? 1 : Math.sign(dx);
  return side * SWAY.push * k * k;
}

/** One step of a prop's lean towards `target` over `dt` seconds. */
export function easeLean(lean: number, target: number, dt: number): number {
  const rate = Math.abs(target) > Math.abs(lean) ? SWAY.bend : SWAY.recover;
  return lean + (target - lean) * Math.min(1, dt * rate);
}
