import { CASTER, ELITE, HORDE, PACE, SHOOTER, VIEW, WAVES } from '../config';
import { SpatialGrid } from '../grid';
import { dist, dist2, isqrt } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Prng } from '../math/prng';
import { teleport, underground, type Body, type Mob, type Player, type SimState } from '../state';
import { mutatorSpeed } from '../mutators';
import { mobSpeed } from './snow';

// Horde movement: every mob walks toward its nearest player, then soft collision moves it out
// of any neighbour closer than the separation radius (resolving overlap in position holds up
// however hard the crowd presses in). A mob with a neighbour right ahead waits instead of
// pressing on, so a jammed crowd stands still rather than churning. Neighbours come from a
// spatial hash, so a step is O(n). Mobs left far behind respawn on a ring around the player,
// and in later chapters so do those he keeps off his screen (outrun).

/** A neighbour counts as ahead within 50 degrees of the way to the target (cos, per mille). */
const AHEAD_COS = 640;
/** Most neighbours one mob looks at; a pile denser than this ignores the rest. */
const MAX_NEAR = 64;
const near = new Int32Array(MAX_NEAR);
/** Share of an overlap a mob removes on its side, as a fraction. */
const STIFF_NUM = 2;
const STIFF_DEN = 5;

export interface MoveParams {
  speed: number;
  /** Mob i's own speed, when the crowd is mixed (else `speed` for all). */
  speedOf?: (i: number) => number;
  stopDist: number;
  /** Mob i's own stop distance (else `stopDist`). */
  stopOf?: (i: number) => number;
  /** Mob i neither walks nor is pushed this tick (an emerger under the ground). */
  still?: (i: number) => boolean;
  /** 0 turns separation off. */
  sep: number;
  queue: boolean;
}

/** Whether (x, y) is on p's screen (VIEW). */
export function inView(p: Player, x: number, y: number): boolean {
  return Math.abs(x - p.x) <= VIEW.halfW && Math.abs(y - p.y) <= VIEW.halfH;
}

/** A big one's walking speed: `speed` once a living hero sees it, else ELITE.enterSpeed to come into sight. */
export function walkSpeed(players: readonly Player[], b: Body, speed: number): number {
  return players.some((p) => !p.dead && inView(p, b.x, b.y)) ? speed : ELITE.enterSpeed;
}

/** The player nearest to (x, y); the first one on a tie. */
export function nearestPlayer(players: readonly Player[], x: number, y: number): Player {
  let best = players[0];
  let bestD = dist2(best.x - x, best.y - y);
  for (let i = 1; i < players.length; i++) {
    const d = dist2(players[i].x - x, players[i].y - y);
    if (d < bestD) {
      bestD = d;
      best = players[i];
    }
  }
  return best;
}

export function stepHorde(mobs: Body[], players: readonly Player[], p: MoveParams, grid?: SpatialGrid): void {
  const separate = p.sep > 0 && mobs.length > 1;
  if (separate) (grid ??= new SpatialGrid(p.sep)).build(mobs);
  const sep2 = p.sep * p.sep;
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    m.px = m.x;
    m.py = m.y;
    if (p.still?.(i)) continue;
    const t = nearestPlayer(players, m.x, m.y);
    const dx = t.x - m.x;
    const dy = t.y - m.y;
    const d = dist(dx, dy);
    if (d > (p.stopOf ? p.stopOf(i) : p.stopDist) && !(p.queue && separate && blocked(mobs, i, dx, dy, d, p.sep, grid!))) {
      const v = p.speedOf ? p.speedOf(i) : p.speed;
      m.x += Math.trunc((dx * v) / d);
      m.y += Math.trunc((dy * v) / d);
    }
    const n = separate ? grid!.near(m.x, m.y, near) : 0;
    for (let k = 0; k < n; k++) {
      const j = near[k];
      if (j === i) continue;
      const ox = m.x - mobs[j].x;
      const oy = m.y - mobs[j].y;
      const od2 = ox * ox + oy * oy;
      if (od2 >= sep2) continue;
      const od = isqrt(od2);
      const push = Math.trunc(((p.sep - od) * STIFF_NUM) / STIFF_DEN);
      if (od > 0) {
        m.x += Math.trunc((ox * push) / od);
        m.y += Math.trunc((oy * push) / od);
      } else {
        // exactly stacked mobs split along a fixed axis
        m.x += i < j ? -push : push;
      }
    }
  }
}

/** True if a neighbour within the separation radius lies ahead of mob i along (dx, dy) / d. */
function blocked(mobs: Body[], i: number, dx: number, dy: number, d: number, r: number, grid: SpatialGrid): boolean {
  const m = mobs[i];
  const n = grid.near(m.x, m.y, near);
  const r2 = r * r;
  for (let k = 0; k < n; k++) {
    const j = near[k];
    if (j === i) continue;
    const ox = mobs[j].x - m.x;
    const oy = mobs[j].y - m.y;
    const od2 = ox * ox + oy * oy;
    if (od2 === 0 || od2 >= r2) continue;
    if ((ox * dx + oy * dy) * TRIG_ONE > AHEAD_COS * isqrt(od2) * d) return true;
  }
  return false;
}

/** Puts `b` on a random point of the respawn ring around (cx, cy), just outside the phone view. */
export function ringPoint(rand: Prng, cx: number, cy: number, b: Body, min = HORDE.ringMin, max = HORDE.ringMax): void {
  const a = rand.int(65536);
  const r = rand.range(min, max);
  teleport(b, cx + Math.trunc((cosB(a) * r) / TRIG_ONE), cy + Math.trunc((sinB(a) * r) / TRIG_ONE));
}

/**
 * Puts mob `m` on the respawn ring around player `p` (ringPoint); while he runs, on the half
 * of it ahead of him (HORDE.aheadArc either side of his heading), so the horde he leaves
 * behind comes back in his way and running off is no escape. `close`: just off a phone's screen
 * that way instead (WAVES.openingBack).
 */
export function respawnPoint(rand: Prng, p: Player, m: Body, close = false): void {
  const a = p.moving ? (p.moveBrad + rand.range(-HORDE.aheadArc, HORDE.aheadArc)) & 65535 : rand.int(65536);
  const c = cosB(a);
  const sn = sinB(a);
  const r = close ? screenEdge(c, sn) + rand.range(0, WAVES.openingBackDepth) : rand.range(HORDE.ringMin, HORDE.ringMax);
  teleport(m, p.x + Math.trunc((c * r) / TRIG_ONE), p.y + Math.trunc((sn * r) / TRIG_ONE));
}

/** How far from the hero the edge of the WAVES.openingBack box lies along (c, sn) / TRIG_ONE. */
function screenEdge(c: number, sn: number): number {
  const side = c === 0 ? WAVES.openingBackH : Math.trunc((WAVES.openingBackW * TRIG_ONE) / Math.abs(c));
  const end = sn === 0 ? WAVES.openingBackW : Math.trunc((WAVES.openingBackH * TRIG_ONE) / Math.abs(sn));
  return Math.min(side, end);
}

/** Mobs inside a pinning field (the Mountain Palm's print) stay where they were. */
function pin(s: SimState): void {
  for (const f of s.fields) {
    if (!f.pin) continue;
    const r2 = f.radius * f.radius;
    for (const m of s.mobs) {
      if (dist2(m.px - f.x, m.py - f.y) < r2) {
        m.x = m.px;
        m.y = m.py;
      }
    }
  }
}

/** Stunned mobs (the Stunning Bell) stay where they were; the timers run down, the howl's too. */
function stunned(s: SimState): void {
  for (const m of s.mobs) {
    if (m.haste > 0) m.haste--;
    if (m.stun <= 0) continue;
    m.stun--;
    m.x = m.px;
    m.y = m.py;
  }
}

/**
 * The horde step (each kind at its own speed, shooters and casters stopping at their range,
 * those under the ground staying put), then mobs left far behind come back around their player
 * (ahead of him while he runs, respawnPoint), and from chapter PACE.from those outrun too.
 */
export function hordeSystem(s: SimState, grid: SpatialGrid): void {
  const c = s.config;
  const speedOf = (i: number) => mutatorSpeed(mobSpeed(s.mobs[i]), c.mutator);
  const stopOf = (i: number) => stopDist(s.mobs[i]);
  const still = (i: number) => underground(s.mobs[i]);
  stepHorde(s.mobs, s.players, { speed: HORDE.speed, speedOf, stopDist: HORDE.stopDist, stopOf, still, sep: grid.cell, queue: c.queue }, grid);
  pin(s);
  stunned(s);
  const far = HORDE.respawnDist * HORDE.respawnDist;
  const lagging = c.chapter >= PACE.from;
  let back = lagging && s.tick % PACE.lagEvery === 0;
  for (const m of s.mobs) {
    if (underground(m)) continue;
    const t = nearestPlayer(s.players, m.x, m.y);
    if (dist2(m.x - t.x, m.y - t.y) > far) {
      respawnPoint(s.ai, t, m);
      m.lag = 0;
    } else if (lagging && outrun(s, m, t, back)) back = false;
  }
}

/** How near mob `m` walks to its hero: shooters and casters stop at their range. */
function stopDist(m: Mob): number {
  return m.kind === 'shooter' ? SHOOTER.stopDist : m.kind === 'caster' ? CASTER.stopDist : HORDE.stopDist;
}

/**
 * Counts the ticks mob `m` stays off every living hero's screen; after PACE.lagTicks, if it came
 * less than PACE.lagGain nearer to `t` (its nearest) all that time, it comes back ahead of him
 * once `back` allows (true when it did). A mob walking up to a hero who stands gains its speed's
 * worth and is left alone, and so is one standing at its range (a caster's lies just off a
 * phone's screen).
 */
function outrun(s: SimState, m: Mob, t: Player, back: boolean): boolean {
  const gap = s.players.some((p) => !p.dead && inView(p, m.x, m.y)) ? 0 : dist(m.x - t.x, m.y - t.y);
  if (gap <= stopDist(m) + PACE.lagGain) {
    m.lag = 0;
    return false;
  }
  if (m.lag === 0) m.gap = gap;
  if (m.lag < PACE.lagTicks && ++m.lag < PACE.lagTicks) return false;
  if (gap <= m.gap - PACE.lagGain) {
    m.lag = 0;
    return false;
  }
  if (!back) return false;
  respawnPoint(s.ai, t, m);
  m.lag = 0;
  return true;
}
