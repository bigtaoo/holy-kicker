/**
 * A beaten boss's fall, timed by the view (the sim stops on the tick the last boss goes down,
 * so its own clock cannot drive it): a shudder, then it sinks into the ground and fades.
 */

/** Seconds from the killing blow until the boss is gone. */
export const FALL_TIME = 1.3;
const SHUDDER = 0.7;
const SHUDDER_PX = 14;
const SHUDDER_HZ = 22;
const SINK_FROM = 0.45;
const FADE_FROM = 0.75;

export interface FallPose {
  /** Sideways offset, world units. */
  dx: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
}

const STANDING: FallPose = { dx: 0, scaleX: 1, scaleY: 1, alpha: 1 };

const ramp = (t: number, from: number, to: number): number => Math.min(1, Math.max(0, (t - from) / (to - from)));

/** The pose `t` seconds after the killing blow (t < 0: still standing). */
export function fallPose(t: number): FallPose {
  if (t < 0) return STANDING;
  const shake = t < SHUDDER ? (1 - t / SHUDDER) * SHUDDER_PX * Math.sin(t * SHUDDER_HZ * 2 * Math.PI) : 0;
  const sink = ramp(t, SINK_FROM, FALL_TIME);
  const k = sink * sink;
  return { dx: shake, scaleX: 1 + 0.25 * k, scaleY: 1 - 0.75 * k, alpha: 1 - ramp(t, FADE_FROM, FALL_TIME) };
}

interface Placed {
  alpha: number;
  position: { set(x: number, y: number): void };
  scale: { set(x: number, y: number): void };
}

/** Puts a boss's view (origin at its feet) and its shadow at (x, y), in `pose`. */
export function placeFallen(view: Placed, shadow: Placed, pose: FallPose, x: number, y: number): void {
  view.alpha = pose.alpha;
  view.scale.set(pose.scaleX, pose.scaleY);
  view.position.set(x + pose.dx, y);
  shadow.alpha = pose.alpha;
  shadow.position.set(x, y);
}

/** The clock of one boss view's fall. */
export class BossFall {
  private t = -1;

  /** Advances by `dt` while the boss is down (from the frame it went down), stands it up again
   *  otherwise; the pose to draw. */
  step(down: boolean, dt: number): FallPose {
    this.t = !down ? -1 : this.t < 0 ? 0 : this.t + dt;
    return fallPose(this.t);
  }
}
