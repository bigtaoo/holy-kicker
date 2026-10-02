// The wooden fish's sound ring, pure (fishView.ts draws it): it grows at the sim's ring speed
// to its reach (where the sim stops hitting), then fades out in place. The fish itself pops
// up beside the hero on the tap and settles back.

export interface RippleLook {
  radius: number;
  alpha: number;
}

const FADE = 0.25;
/** Seconds the fish shows for a tap. */
export const FISH_SHOW = 0.4;

/** The ring `t` seconds after the tap, growing at `speed` units/s; null once it is gone. */
export function rippleAt(t: number, reach: number, speed: number): RippleLook | null {
  const grow = reach / speed;
  if (t < grow) return { radius: speed * t, alpha: 1 };
  const k = (t - grow) / FADE;
  return k >= 1 ? null : { radius: reach, alpha: 1 - k };
}

/** The fish's scale `t` seconds into a tap: a quick pop past full size, then back to nothing. */
export function fishPop(t: number): number {
  if (t <= 0 || t >= FISH_SHOW) return 0;
  const k = t / FISH_SHOW;
  if (k < 0.2) return (k / 0.2) * 1.15;
  if (k < 0.35) return 1.15 - ((k - 0.2) / 0.15) * 0.15;
  if (k < 0.8) return 1;
  return 1 - (k - 0.8) / 0.2;
}
