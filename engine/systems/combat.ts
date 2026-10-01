import { BALL, DAMAGE, ELITE } from '../config';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import type { Ball, Body, Player, SimState } from '../state';
import { hurtBoss } from './boss';
import { dropGem } from './drops';
import { ringPoint } from './horde';

// Hit targets and damage. Targets are numbered: the horde mobs first (by index), then the
// elite, then the boss, so a ball can remember "the one I hit last" as a plain integer.

export function eliteIndex(s: SimState): number {
  return s.mobs.length;
}

export function bossIndex(s: SimState): number {
  return s.mobs.length + 1;
}

/** Target i, or null if it is not there (no elite, or the boss lying defeated). */
export function targetAt(s: SimState, i: number): Body | null {
  if (i < s.mobs.length) return s.mobs[i];
  if (i === eliteIndex(s)) return s.elite;
  if (i === bossIndex(s) && s.boss && s.boss.phase !== 'down') return s.boss;
  return null;
}

/** Index of the nearest target within maxDist of (x, y), skipping `skip`; -1 if none. */
export function nearestTarget(s: SimState, x: number, y: number, maxDist: number, skip = -1): number {
  let best = -1;
  let bestD = maxDist * maxDist;
  const n = bossIndex(s);
  for (let i = 0; i <= n; i++) {
    const t = i === skip ? null : targetAt(s, i);
    if (!t) continue;
    const d = dist2(t.x - x, t.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The boss when in range (the weapon locks onto it first), else the nearest target. */
export function kickTarget(s: SimState, p: Player, range: number): number {
  const b = targetAt(s, bossIndex(s));
  if (b && dist2(b.x - p.x, b.y - p.y) <= range * range) return bossIndex(s);
  return nearestTarget(s, p.x, p.y, range);
}

/**
 * Damages target i on behalf of player `by`. Mobs go down (a gem drops, they respawn on the
 * ring), the elite loses health and is knocked back, the boss loses health.
 */
export function damage(s: SimState, events: SimEvent[], i: number, by: Player, ball: Body | null): void {
  const t = targetAt(s, i);
  if (!t) return;
  const crit = s.combat.chance(DAMAGE.critPercent, 100);
  const value = s.combat.range(DAMAGE.min, DAMAGE.max) * (crit ? DAMAGE.critMul : 1);
  const kind = i < s.mobs.length ? 'mob' : i === eliteIndex(s) ? 'elite' : 'boss';
  events.push({ type: 'hit', kind, index: i, x: t.x, y: t.y, value, crit, ball: !!ball, bx: ball?.x ?? 0, by: ball?.y ?? 0 });
  if (kind === 'boss') {
    if (hurtBoss(s.boss!, value)) {
      s.boss!.phase = 'down';
      s.boss!.t = 0;
      events.push({ type: 'bossDown' });
    }
  } else if (kind === 'elite') {
    // the sandbox keeps its elite for the readability tests; in a chapter it can fall
    const e = s.elite!;
    if (s.config.waves > 0) e.hp = Math.max(0, e.hp - value);
    if (e.hp === 0) {
      events.push({ type: 'eliteDown', x: e.x, y: e.y });
      dropGem(s, e.x, e.y, ELITE.gem);
      s.elite = null;
      return;
    }
    const d = dist(t.x - by.x, t.y - by.y) || 1;
    t.x += Math.trunc(((t.x - by.x) * ELITE.knockback) / d);
    t.y += Math.trunc(((t.y - by.y) * ELITE.knockback) / d);
  } else {
    events.push({ type: 'mobDown', index: i, x: t.x, y: t.y, dx: t.x - by.x, dy: t.y - by.y });
    dropGem(s, t.x, t.y, 1);
    ringPoint(s.ai, by.x, by.y, t);
  }
}

function aim(b: Ball, tx: number, ty: number): void {
  const d = dist(tx - b.x, ty - b.y) || 1;
  b.vx = Math.trunc(((tx - b.x) * BALL.speed) / d);
  b.vy = Math.trunc(((ty - b.y) * BALL.speed) / d);
}

export function launchBall(s: SimState, owner: number, x: number, y: number, tx: number, ty: number): void {
  const b: Ball = { id: s.nextId++, owner, x, y, px: x, py: y, vx: 0, vy: 0, hits: 0, last: -1, travel: BALL.maxTravel };
  aim(b, tx, ty);
  s.balls.push(b);
}

/** Flies every ball; a hit ricochets to the nearest other target until the bounces run out. */
export function ballSystem(s: SimState, events: SimEvent[]): void {
  const balls = s.balls;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx;
    b.y += b.vy;
    b.travel -= BALL.speed;
    let alive = b.travel > 0;
    const hit = nearestTarget(s, b.x, b.y, BALL.hitRadius, b.last);
    if (hit >= 0) {
      b.hits++;
      b.last = hit;
      b.travel = BALL.maxTravel;
      const next = b.hits < BALL.maxHits ? nearestTarget(s, b.x, b.y, BALL.seekRange, hit) : -1;
      alive = next >= 0;
      if (alive) {
        const t = targetAt(s, next)!;
        aim(b, t.x, t.y);
      }
      const by = s.players.find((p) => p.owner === b.owner) ?? s.players[0];
      damage(s, events, hit, by, b);
    }
    if (!alive) {
      // order kept (not swap-removed), so the hash and the view see a stable sequence
      balls.splice(i--, 1);
    }
  }
}
