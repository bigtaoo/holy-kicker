import { CASTER, HORDE, SHOOTER } from '../config';
import { SpatialGrid } from '../grid';
import { dist, dist2, isqrt } from '../math/fixed';
import { cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Prng } from '../math/prng';
import { teleport, underground, type Body, type Player, type SimState } from '../state';
import { mobSpeed } from './snow';

// Horde movement: every mob walks toward its nearest player, then soft collision moves it out
// of any neighbour closer than the separation radius (resolving overlap in position holds up
// however hard the crowd presses in). A mob with a neighbour right ahead waits instead of
// pressing on, so a jammed crowd stands still rather than churning. Neighbours come from a
// spatial hash, so a step is O(n). Mobs left far behind respawn on a ring around the player.

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
export function ringPoint(rand: Prng, cx: number, cy: number, b: Body): void {
  const a = rand.int(65536);
  const r = rand.range(HORDE.ringMin, HORDE.ringMax);
  teleport(b, cx + Math.trunc((cosB(a) * r) / TRIG_ONE), cy + Math.trunc((sinB(a) * r) / TRIG_ONE));
}

/**
 * Puts mob `m` on the respawn ring around player `p` (ringPoint); while he runs, on the half
 * of it ahead of him (HORDE.aheadArc either side of his heading), so the horde he leaves
 * behind comes back in his way and running off is no escape.
 */
export function respawnPoint(rand: Prng, p: Player, m: Body): void {
  if (!p.moving) {
    ringPoint(rand, p.x, p.y, m);
    return;
  }
  const a = (p.moveBrad + rand.range(-HORDE.aheadArc, HORDE.aheadArc)) & 65535;
  const r = rand.range(HORDE.ringMin, HORDE.ringMax);
  teleport(m, p.x + Math.trunc((cosB(a) * r) / TRIG_ONE), p.y + Math.trunc((sinB(a) * r) / TRIG_ONE));
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
 * (ahead of him while he runs, respawnPoint).
 */
export function hordeSystem(s: SimState, grid: SpatialGrid): void {
  const c = s.config;
  const speedOf = (i: number) => mobSpeed(s.mobs[i]);
  const stopOf = (i: number) => {
    const k = s.mobs[i].kind;
    return k === 'shooter' ? SHOOTER.stopDist : k === 'caster' ? CASTER.stopDist : HORDE.stopDist;
  };
  const still = (i: number) => underground(s.mobs[i]);
  stepHorde(s.mobs, s.players, { speed: HORDE.speed, speedOf, stopDist: HORDE.stopDist, stopOf, still, sep: grid.cell, queue: c.queue }, grid);
  pin(s);
  stunned(s);
  const far = HORDE.respawnDist * HORDE.respawnDist;
  for (const m of s.mobs) {
    if (underground(m)) continue;
    const t = nearestPlayer(s.players, m.x, m.y);
    if (dist2(m.x - t.x, m.y - t.y) > far) respawnPoint(s.ai, t, m);
  }
}
