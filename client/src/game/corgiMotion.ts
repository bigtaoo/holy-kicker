// The corgi hero's procedural motion (docs/reskin.md "Animation › Hero"), free of Pixi so it can
// be tested: whether the guns are up at all, which of the twin pistols is, how each paw aims, the
// lean, the head's slow look, the run clip's rate and the recoil. corgiHero.ts applies it to the rig. Angles are radians with
// y down; speeds are world units per second.

const DEG = Math.PI / 180;
/** Either side of straight out: past vertical, so each paw reaches straight up and down. */
export const MAX_AIM = 100 * DEG;
/** The arm stops short of that and the wrist turns the rest, so a gun aimed up stays beside the head. */
export const MAX_ARM = 55 * DEG;
/** Seconds to lower one gun and raise the other. */
const SWAP = 0.16;
/** Degrees the body leans into a run at full speed (a clockwise turn tips the top right). */
const LEAN = 3;
/** The head turns toward the aim by this share of the paw's angle, at most HEAD_MAX degrees. */
const HEAD_SHARE = 0.12;
const HEAD_MAX = 6;
/** Per second: how fast the lean and the head close on their targets. */
const LEAN_RATE = 10;
const LOOK_RATE = 4;
/** Per second: how fast a shot's kick wears off. */
const RECOIL_FADE = 7;
/** The run clip's rate at a standstill's edge and at full speed; it follows the ground speed between. */
const RUN_RATE_MIN = 0.75;
const RUN_RATE_MAX = 1.2;
/**
 * The guns hang at the corgi's sides (the clips' pose) until an attack: they come up over
 * RAISE seconds, stay up for HOLD after the last one and go back down over LOWER.
 */
const RAISE = 0.08;
const HOLD = 0.6;
const LOWER = 0.25;
/** Below this speed (units/s) the corgi stands. */
export const RUN_SPEED = 40;

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** The aim's side (-1 left, 1 right) after an aim `dx` across from the body: it flips only once the aim is `dead` past the body. */
export function aimSide(side: number, dx: number, dead: number): number {
  return dx * side < -dead ? -side : side;
}

/**
 * A paw pointing out along `out` (π for the left paw, 0 the right) toward a target at angle
 * `to`: the gun's angle (clamped to the paw's side), the arm's (clamped harder; the wrist turns
 * the rest) and the deviation from straight out.
 */
export function pawAim(out: number, to: number): { gun: number; arm: number; dev: number } {
  const dev = Math.max(-MAX_AIM, Math.min(MAX_AIM, wrapAngle(to - out)));
  return { gun: out + dev, arm: out + Math.max(-MAX_ARM, Math.min(MAX_ARM, dev)), dev };
}

/** Degrees the head turns for a paw `dev` off straight out, before the weight of that paw's gun. */
export function headTurn(dev: number): number {
  return Math.max(-HEAD_MAX, Math.min(HEAD_MAX, (dev / DEG) * HEAD_SHARE));
}

/**
 * The run clip's rate for a ground speed `speed` out of `full`: the cycle follows the speed, so
 * feet slide less, within a calm range. The trot faces the camera, so it plays forwards either way.
 */
export function runRate(speed: number, full: number): number {
  return Math.max(RUN_RATE_MIN, Math.min(RUN_RATE_MAX, (speed / full) * RUN_RATE_MAX));
}

/** Eases a value toward a target at `rate` per second (exponential, steady under any frame time). */
export function follow(v: number, target: number, rate: number, dt: number): number {
  return v + (target - v) * Math.min(1, dt * rate);
}

/** The state that carries from frame to frame: the guns' raise and swap, lean, head and recoil. */
export class CorgiMotion {
  /** How far the guns are up out of the clips' carry, 0..1 (linear; `raise` eases it). */
  private lift = 0;
  /** Seconds the guns stay up. */
  private hold = 0;
  /** The aim's side: -1 left (the far paw's gun), 1 right (the near paw's). */
  side = -1;
  /** 0 with the left gun up, 1 with the right one. */
  private swap = 0;
  lean = 0;
  look = 0;
  /** Each gun's kick, 1 on a shot and fading: [left, right]. */
  readonly recoil = [0, 0];

  /** Smoothstepped swap: how far the right gun is up, 0..1. */
  get up(): number {
    return this.swap * this.swap * (3 - 2 * this.swap);
  }

  /** The gun that is up: 0 left, 1 right. */
  get raised(): 0 | 1 {
    return this.up > 0.5 ? 1 : 0;
  }

  /** Eased: how far the guns are up at all, 0 at the sides, 1 aiming. */
  get raise(): number {
    return this.lift * this.lift * (3 - 2 * this.lift);
  }

  /** How much paw `i` (0 left, 1 right) is raised, 0..1. */
  weight(i: 0 | 1): number {
    return (i === 0 ? 1 - this.up : this.up) * this.raise;
  }

  /** An attack: the guns come up (or stay up) for another HOLD seconds. */
  alert(): void {
    this.hold = HOLD;
  }

  /**
   * Advances a frame: the aim `aimDx` across from the body (with `dead` the swap's dead zone),
   * the body's velocity `vx` out of a top speed `full`.
   */
  step(dt: number, aimDx: number, dead: number, vx: number, full: number): void {
    this.side = aimSide(this.side, aimDx, dead);
    this.swap = approach(this.swap, this.side > 0 ? 1 : 0, dt / SWAP);
    this.hold = Math.max(0, this.hold - dt);
    this.lift = this.hold > 0 ? Math.min(1, this.lift + dt / RAISE) : Math.max(0, this.lift - dt / LOWER);
    const run = Math.max(-1, Math.min(1, vx / full));
    this.lean = follow(this.lean, run * LEAN, LEAN_RATE, dt);
    for (const i of [0, 1]) this.recoil[i] = Math.max(0, this.recoil[i] - dt * RECOIL_FADE);
  }

  /** Turns the head toward `target` degrees, slowly, so a sweeping aim does not wag it. */
  lookAt(target: number, dt: number): void {
    this.look = follow(this.look, target, LOOK_RATE, dt);
  }

  /** The raised gun goes off: its kick starts over. Returns which gun it was. */
  fire(): 0 | 1 {
    const i = this.raised;
    this.recoil[i] = 1;
    return i;
  }
}
