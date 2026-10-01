import type { Mob } from './horde';

// The kicked cuju ball: flies at a target, and on each hit ricochets to the nearest other
// mob until it runs out of bounces or finds nothing in range. Pure, tested without Pixi.

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hits: number;
  /** The mob hit last, so the ball does not hit it again on the way out. */
  last: number;
  /** Distance left before the ball drops dead. */
  travel: number;
  alive: boolean;
}

export interface BallParams {
  speed: number;
  /** A mob closer than this to the ball centre is hit. */
  hitRadius: number;
  /** How far a ricochet looks for its next target. */
  seekRange: number;
  maxHits: number;
  maxTravel: number;
}

/** Index of the nearest mob within maxDist of (x, y), skipping `skip`; -1 if none. */
export function nearest(mobs: readonly Mob[], x: number, y: number, maxDist: number, skip = -1): number {
  let best = -1;
  let bestD = maxDist * maxDist;
  for (let i = 0; i < mobs.length; i++) {
    if (i === skip) continue;
    const d = (mobs[i].x - x) ** 2 + (mobs[i].y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Kicks a ball from (x, y) at (tx, ty), reusing `out` if given. */
export function launch(x: number, y: number, tx: number, ty: number, p: BallParams, out = {} as Ball): Ball {
  const ball = Object.assign(out, { x, y, vx: 0, vy: 0, hits: 0, last: -1, travel: p.maxTravel, alive: true });
  aim(ball, tx, ty, p.speed);
  return ball;
}

function aim(ball: Ball, tx: number, ty: number, speed: number): void {
  const d = Math.hypot(tx - ball.x, ty - ball.y) || 1;
  ball.vx = ((tx - ball.x) / d) * speed;
  ball.vy = ((ty - ball.y) / d) * speed;
}

/** Moves the ball; returns the index of the mob it hit this step, or -1. */
export function stepBall(ball: Ball, mobs: readonly Mob[], dt: number, p: BallParams): number {
  if (!ball.alive) return -1;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.travel -= p.speed * dt;
  const hit = nearest(mobs, ball.x, ball.y, p.hitRadius, ball.last);
  if (hit >= 0) {
    ball.hits++;
    ball.last = hit;
    ball.travel = p.maxTravel;
    const next = ball.hits < p.maxHits ? nearest(mobs, ball.x, ball.y, p.seekRange, hit) : -1;
    if (next >= 0) aim(ball, mobs[next].x, mobs[next].y, p.speed);
    else ball.alive = false;
  } else if (ball.travel <= 0) {
    ball.alive = false;
  }
  return hit;
}
