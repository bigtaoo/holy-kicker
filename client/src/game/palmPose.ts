// The falling palm's timing (Rulai Palm, engine systems/spells.ts): its shadow grows on the
// ground while the golden hand drops from the sky, faster and faster, and lands exactly when
// the sim's blast does; it squashes on the hit, holds a moment and fades, sinking a little. The
// Mountain Palm's stone hand holds for as long as its print pins the crowd. Pure, so it is tested
// without Pixi; palmView.ts draws it.

/** How high above its landing point the hand starts, world units (off the top of the screen). */
export const PALM_DROP = 1100;
/** After landing: the squash, then the hold, then the fade, seconds. */
export const PALM_SQUASH = 0.12;
export const PALM_HOLD = 0.3;
export const PALM_FADE = 0.25;

export interface PalmPose {
  /** Height of the hand above its landing point. */
  lift: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  /** The shadow on the ground: its size (1 = the blast) and opacity. */
  shadow: number;
  shadowAlpha: number;
  /** Past its fade: the palm can go. */
  done: boolean;
}

/** How long a palm that pins for `print` seconds holds after its squash (the plain one: PALM_HOLD). */
export function palmHold(print: number): number {
  return Math.max(PALM_HOLD, print - PALM_SQUASH - PALM_FADE);
}

/** The pose `t` seconds after the cast of a palm that lands after `fall` seconds and holds `hold`. */
export function palmPose(t: number, fall: number, hold = PALM_HOLD): PalmPose {
  if (t < fall) {
    const k = fall > 0 ? t / fall : 1;
    const grow = 0.85 + 0.15 * k;
    return {
      lift: PALM_DROP * (1 - k * k), scaleX: grow, scaleY: grow, alpha: Math.min(1, t / 0.06),
      shadow: 0.4 + 0.6 * k, shadowAlpha: 0.5 * k, done: false,
    };
  }
  const u = t - fall;
  const squash = u < PALM_SQUASH ? Math.sin((Math.PI * u) / PALM_SQUASH) : 0;
  const fade = (u - PALM_SQUASH - hold) / PALM_FADE;
  const sink = 0.3 * Math.max(0, Math.min(1, fade));
  return {
    lift: 0, scaleX: 1 + 0.12 * squash, scaleY: 1 - 0.18 * squash - sink, alpha: Math.max(0, Math.min(1, 1 - fade)),
    shadow: 1, shadowAlpha: Math.max(0, 0.5 * (1 - u / 0.1)), done: fade >= 1,
  };
}
