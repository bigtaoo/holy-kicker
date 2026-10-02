import { BALL, DAMAGE, ELITE } from '../config';
import { EVOLVE } from '../content';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import type { Ball, Body, Player, SimState } from '../state';
import { hurtBoss } from './boss';
import { stat } from './build';
import { dropGem } from './drops';
import { ringPoint } from './horde';
import { mobHp } from './waves';

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

/** The boss, else the elite, when in range (the relic locks onto them first), else the nearest target. */
export function kickTarget(s: SimState, p: Player, range: number): number {
  for (const i of [bossIndex(s), eliteIndex(s)]) {
    const t = targetAt(s, i);
    if (t && dist2(t.x - p.x, t.y - p.y) <= range * range) return i;
  }
  return nearestTarget(s, p.x, p.y, range);
}

/**
 * Damages target i on behalf of player `by`, at `pct` percent of a base roll (the crit stat
 * raises the crit chance). Mobs lose health and at 0 go down (a gem drops, they respawn on the
 * ring with the wave's health), the elite loses health and is knocked back (unless `knock` is
 * off: the staff keeps it in reach), the boss loses health.
 */
export function damage(s: SimState, events: SimEvent[], i: number, by: Player, ball: Body | null, pct = 100, knock = true): void {
  const t = targetAt(s, i);
  if (!t) return;
  const crit = s.combat.chance(DAMAGE.critPercent + stat(by, 'crit'), 100);
  const roll = s.combat.range(DAMAGE.min, DAMAGE.max) * (crit ? DAMAGE.critMul : 1);
  const value = Math.max(1, Math.trunc((roll * pct) / 100));
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
    if (!knock) return;
    const d = dist(t.x - by.x, t.y - by.y) || 1;
    t.x += Math.trunc(((t.x - by.x) * ELITE.knockback) / d);
    t.y += Math.trunc(((t.y - by.y) * ELITE.knockback) / d);
  } else {
    const m = s.mobs[i];
    m.hp -= value;
    if (m.hp > 0) return;
    m.hp = mobHp(s.wave);
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

/**
 * A ball from (x, y) at (tx, ty) that bounces `maxHits` times at `damagePct` percent; a `split`
 * ball (the awakened Meteor Ball) sends splinters at every bounce.
 */
export function launchBall(
  s: SimState, owner: number, x: number, y: number, tx: number, ty: number, maxHits: number, damagePct: number, split = false,
): Ball {
  const b: Ball = {
    id: s.nextId++, owner, x, y, px: x, py: y, vx: 0, vy: 0, hits: 0, maxHits, damage: damagePct, last: -1, travel: BALL.maxTravel, split,
  };
  aim(b, tx, ty);
  s.balls.push(b);
  return b;
}

/** Meteor Ball: splinters from b's bounce on `hit`, each at another near target (not `next`). */
function splinter(s: SimState, b: Ball, hit: number, next: number): void {
  const taken = [hit, next];
  for (let k = 0; k < EVOLVE.splinters; k++) {
    let best = -1;
    let bestD = EVOLVE.splinterRange * EVOLVE.splinterRange;
    for (let i = 0; i <= bossIndex(s); i++) {
      const t = taken.includes(i) ? null : targetAt(s, i);
      if (!t) continue;
      const d = dist2(t.x - b.x, t.y - b.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    taken.push(best);
    const t = targetAt(s, best)!;
    launchBall(s, b.owner, b.x, b.y, t.x, t.y, 1, b.damage).last = hit;
  }
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
      const next = b.hits < b.maxHits ? nearestTarget(s, b.x, b.y, BALL.seekRange, hit) : -1;
      alive = next >= 0;
      if (alive) {
        const t = targetAt(s, next)!;
        aim(b, t.x, t.y);
      }
      if (b.split) splinter(s, b, hit, next);
      const by = s.players.find((p) => p.owner === b.owner) ?? s.players[0];
      damage(s, events, hit, by, b, b.damage);
    }
    if (!alive) {
      // order kept (not swap-removed), so the hash and the view see a stable sequence
      balls.splice(i--, 1);
    }
  }
}
