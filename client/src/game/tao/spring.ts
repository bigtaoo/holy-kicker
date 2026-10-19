import type { Affine } from './pose';

// Secondary motion for .tao skeletons: an appendage (ear, tail, scarf) swings on a damped
// angular spring, pushed by its pivot's acceleration, so it lags behind starts, stops and
// turns and settles back by itself. Pure, so it is tested without Pixi.

export interface SpringSpec {
  /** Pull back to the clip's pose, 1/s². Higher swings faster. */
  stiffness: number;
  /** Velocity loss, 1/s. 2·sqrt(stiffness) is critically damped; less wobbles. */
  damping: number;
  /** Degrees of swing per unit of sideways acceleration (skeleton px/s²). */
  gain: number;
  /** Clamp on the swing, degrees either way. */
  limit: number;
}

export interface SpringState {
  angle: number;
  velocity: number;
}

/** Longest step integrated at once; longer frames are split so stiff springs stay stable. */
const MAX_STEP = 1 / 120;

/**
 * Advances one spring by dt. `ax, ay` is its pivot's acceleration and `dx, dy` the unit
 * direction from the pivot to the appendage's tip, both in the same space (y down, angles
 * clockwise): a pivot that speeds up sideways leaves the tip behind.
 */
export function stepSpring(s: SpringState, spec: SpringSpec, ax: number, ay: number, dx: number, dy: number, dt: number): void {
  const push = spec.gain * (ax * dy - ay * dx);
  let left = dt;
  while (left > 0) {
    const h = Math.min(MAX_STEP, left);
    left -= h;
    s.velocity += (-spec.stiffness * s.angle - spec.damping * s.velocity + push) * h;
    s.angle += s.velocity * h;
    if (s.angle > spec.limit) {
      s.angle = spec.limit;
      s.velocity = Math.min(0, s.velocity);
    } else if (s.angle < -spec.limit) {
      s.angle = -spec.limit;
      s.velocity = Math.max(0, s.velocity);
    }
  }
}

/** Tracks a point's velocity and acceleration over frames (finite differences). */
export class Motion {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private primed = 0;
  ax = 0;
  ay = 0;

  /** Feeds the point's position after a step of dt seconds. */
  push(x: number, y: number, dt: number): void {
    if (dt <= 0) return;
    const vx = (x - this.x) / dt;
    const vy = (y - this.y) / dt;
    // the first two samples have no history; report no acceleration until there is
    this.ax = this.primed > 1 ? (vx - this.vx) / dt : 0;
    this.ay = this.primed > 1 ? (vy - this.vy) / dt : 0;
    if (this.primed > 0) {
      this.vx = vx;
      this.vy = vy;
    }
    this.primed = Math.min(2, this.primed + 1);
    this.x = x;
    this.y = y;
  }
}

/** One spring-driven bone: tracks its pivot and returns the swing to add to its rotation. */
export class BoneSpring {
  readonly state: SpringState = { angle: 0, velocity: 0 };
  private readonly motion = new Motion();

  /** `tip` is a point of the appendage in the bone's own space (e.g. its image centre). */
  constructor(
    readonly bone: string,
    readonly spec: SpringSpec,
    private readonly tip: { x: number; y: number },
  ) {}

  /** `m` is the bone's world matrix before the swing; `ox, oy` how far the actor has travelled. */
  step(m: Affine, ox: number, oy: number, dt: number): number {
    if (dt <= 0) return this.state.angle;
    this.motion.push(m.tx + ox, m.ty + oy, dt);
    const dx = m.a * this.tip.x + m.c * this.tip.y;
    const dy = m.b * this.tip.x + m.d * this.tip.y;
    const len = Math.hypot(dx, dy) || 1;
    stepSpring(this.state, this.spec, this.motion.ax, this.motion.ay, dx / len, dy / len, dt);
    return this.state.angle;
  }
}
