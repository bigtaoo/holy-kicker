import { BEADS, BOWL, FISH, FP, type RelicId } from '@hk/engine';
import { byHeat } from './fxHeat';

// The maths behind the staff's, fish's, beads' and bowl's blows landing (hitFeedback.ts) and
// their own effects' heat (staffView.ts, fishView.ts, beadsView.ts, bowlView.ts), free of Pixi
// so it is tested on its own. The sim's hit event only marks the ball's hits, so a relic's
// blow is told from a spell's by where it landed: inside the tick's staff sweep, on a sound
// ring's edge, under a bead or under a bowl. All positions in FP, as the sim's.

/** How far past a relic's own reach a struck target may stand (it was knocked, or walked). */
const SLACK = 40 * FP;

export interface Point {
  x: number;
  y: number;
}

/** A staff sweep this tick: from (x, y), out to `reach`. */
export interface SweepAt extends Point {
  reach: number;
}

/** A sound ring: centre, radius now and its reach. */
export interface RingAt extends Point {
  radius: number;
  reach: number;
}

/** What of the sim a relic blow can come from (SimState fits). */
export interface RelicBodies {
  rings: readonly RingAt[];
  beads: readonly Point[];
  bowls: readonly Point[];
}

function near(p: Point, x: number, y: number, r: number): boolean {
  return Math.hypot(x - p.x, y - p.y) <= r;
}

/**
 * Where the hero's `relic` blow that landed on a target at (x, y) came from, or null when no
 * relic's body could have dealt it (a spell did, or the relic is the ball, which the sim
 * marks itself). `sweep` is this tick's staff sweep, `lastRings` the rings at the end of the
 * tick before: a ring that reached its reach this tick has gone from `s` by the time the view
 * sees its last hits.
 */
export function relicSource(
  relic: RelicId, x: number, y: number, s: RelicBodies, sweep: SweepAt | null, lastRings: readonly RingAt[],
): Point | null {
  switch (relic) {
    case 'staff':
      return sweep && near(sweep, x, y, sweep.reach + SLACK) ? sweep : null;
    case 'fish': {
      for (const r of s.rings) if (onRing(r, r.radius, x, y)) return r;
      for (const r of lastRings) if (onRing(r, Math.min(r.reach, r.radius + FISH.ringSpeed), x, y)) return r;
      return null;
    }
    case 'beads':
      return s.beads.find((b) => near(b, x, y, BEADS.radius + SLACK)) ?? null;
    case 'bowl':
      return s.bowls.find((b) => near(b, x, y, BOWL.radius + SLACK)) ?? null;
    default:
      return null;
  }
}

/** On the band the ring swept this tick, from its last radius out to `radius`. */
function onRing(r: Point, radius: number, x: number, y: number): boolean {
  const d = Math.hypot(x - r.x, y - r.y);
  return d <= radius + SLACK && d >= radius - FISH.ringSpeed - SLACK;
}

/**
 * Where the burst of a blow from `src` onto a target at (x, y) goes: on the target's near side,
 * `back` units toward the blow (half the gap when closer), world units.
 */
export function impactPoint(src: Point, x: number, y: number, back: number): Point {
  const dx = x - src.x;
  const dy = y - src.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: x / FP, y: y / FP };
  const k = Math.min(back * FP, d / 2) / d;
  return { x: (x - dx * k) / FP, y: (y - dy * k) / FP };
}

/** Size of a relic's own swing, ring or streak: fuller on the empty opening screen, smaller late. */
export function relicSize(heat: number): number {
  return byHeat(clamp01(heat), 1.25, 0.85);
}

/** Opacity of the same: full in the opening, 0.65 late. */
export function relicAlpha(heat: number): number {
  return byHeat(clamp01(heat), 1, 0.65);
}

/** Opacity of the extras the opening adds (the staff's bright edge, the fish's echo ring, the streaks): faint late. */
export function relicExtra(heat: number): number {
  return byHeat(clamp01(heat), 1, 0.2);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * One segment of a tapering ribbon from (x0, y0), `w0` wide, to (x1, y1), `w1` wide, as the
 * four corners of its quad (x, y pairs) written into `out`; false for a segment of no length.
 */
export function ribbonQuad(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, out: number[]): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  const nx = -dy / len;
  const ny = dx / len;
  out.length = 8;
  out[0] = x0 + (nx * w0) / 2;
  out[1] = y0 + (ny * w0) / 2;
  out[2] = x1 + (nx * w1) / 2;
  out[3] = y1 + (ny * w1) / 2;
  out[4] = x1 - (nx * w1) / 2;
  out[5] = y1 - (ny * w1) / 2;
  out[6] = x0 - (nx * w0) / 2;
  out[7] = y0 - (ny * w0) / 2;
  return true;
}
