// The falling palm's timing (Rulai Palm, engine systems/spells.ts): its shadow grows on the
// ground while the golden hand drops from the sky, faster and faster, and lands exactly when
// the sim's blast does; it squashes on the hit, holds a moment and fades, sinking a little. The
// Mountain Palm's stone hand slams the same way, holds a moment and then sinks deep into its
// print, which pins the crowd on its own after that (a stone hand standing for the whole pin hid
// the horde behind three of them at once). Pure, so it is tested without Pixi; palmView.ts draws it.

/** How high above its landing point the hand starts, world units (off the top of the screen). */
export const PALM_DROP = 1100;
/** After landing: the squash, then the hold, then the fade, seconds. */
export const PALM_SQUASH = 0.12;
export const PALM_HOLD = 0.3;
export const PALM_FADE = 0.25;
/** The Mountain Palm's stone hand: its hold, how long it sinks and how deep (share of its height). */
export const MOUNTAIN_HOLD = 0.3;
export const MOUNTAIN_SINK = 0.35;
export const MOUNTAIN_DEPTH = 0.85;
/** The plain palm sinks this much as it fades. */
const PALM_DEPTH = 0.3;

/** How a palm leaves after its hold. */
export interface PalmExit {
  hold: number;
  /** Seconds it takes to fade out. */
  fade: number;
  /** How much of its height it sinks while fading. */
  depth: number;
}

export const PALM_EXIT: PalmExit = { hold: PALM_HOLD, fade: PALM_FADE, depth: PALM_DEPTH };
export const MOUNTAIN_EXIT: PalmExit = { hold: MOUNTAIN_HOLD, fade: MOUNTAIN_SINK, depth: MOUNTAIN_DEPTH };

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

/** Seconds after landing that the palm starts to fade (and the stone hand to sink). */
export function palmSinks(exit: PalmExit): number {
  return PALM_SQUASH + exit.hold;
}

/** The pose `t` seconds after the cast of a palm that lands after `fall` seconds and leaves as `exit`. */
export function palmPose(t: number, fall: number, exit: PalmExit = PALM_EXIT): PalmPose {
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
  const fade = (u - palmSinks(exit)) / exit.fade;
  const k = Math.max(0, Math.min(1, fade));
  // a deep sink eases in, so the hand settles before it drops away; it fades over its second half
  const sink = exit.depth * (exit.depth > PALM_DEPTH ? k * k : k);
  const gone = exit.depth > PALM_DEPTH ? 2 * k - 1 : k;
  return {
    lift: 0, scaleX: 1 + 0.12 * squash, scaleY: 1 - 0.18 * squash - sink, alpha: Math.max(0, Math.min(1, 1 - gone)),
    shadow: 1, shadowAlpha: Math.max(0, 0.5 * (1 - u / 0.1)), done: fade >= 1,
  };
}
