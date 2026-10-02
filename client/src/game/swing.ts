// The staff swing's arc, pure (staffView.ts draws it): from 90 degrees before the aim to 90
// after (a full turn for the Ruyi Staff), turning clockwise on screen when the hero faces
// right and counter-clockwise when he faces left, so the staff comes round from his back.

export interface SwingArc {
  /** Screen angles in radians (y down), the staff at `from` when the swing starts. */
  from: number;
  to: number;
  reach: number;
  /** Seconds the staff turns, then seconds the trail fades. */
  swing: number;
  fade: number;
}

const HALF_SWING = 0.13;
const FULL_SWING = 0.22;
const FADE = 0.22;

export function swingArc(brad: number, reach: number, full: boolean, facing: number): SwingArc {
  const aim = (brad / 65536) * Math.PI * 2;
  const dir = facing < 0 ? -1 : 1;
  const span = full ? Math.PI * 2 : Math.PI;
  const from = full ? aim : aim - (dir * span) / 2;
  return { from, to: from + dir * span, reach, swing: full ? FULL_SWING : HALF_SWING, fade: FADE };
}

/** The staff's angle `k` (0..1) of the way through the swing, eased out. */
export function swingAngle(a: SwingArc, k: number): number {
  const e = 1 - (1 - k) * (1 - k);
  return a.from + (a.to - a.from) * e;
}
