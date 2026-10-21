// The hero's health bar colours (healthBar.ts): four discrete bands by share of the max health,
// and a gentle pulse in the red one. No lerp between bands, so the colour itself reads as a step.

export const BAND_GREEN = 0x5fd35a;
export const BAND_YELLOW_GREEN = 0xb8d040;
export const BAND_AMBER = 0xf0b030;
export const BAND_RED = 0xe0303a;
/** The red band's bright end of the pulse. */
export const BAND_RED_BRIGHT = 0xff8088;
/** Pulses per second in the red band. */
export const PULSE_HZ = 1.6;

/** The fill colour for `share` (0..1) of the max health. */
export function bandColor(share: number): number {
  return share >= 0.75 ? BAND_GREEN : share >= 0.5 ? BAND_YELLOW_GREEN : share >= 0.25 ? BAND_AMBER : BAND_RED;
}

/** The red band's colour at `time` seconds: a soft swing between red and a lighter red. */
export function redPulse(time: number): number {
  const m = 0.5 - 0.5 * Math.cos(time * PULSE_HZ * 2 * Math.PI);
  return mix(BAND_RED, BAND_RED_BRIGHT, m * 0.6);
}

function mix(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}
