import { BALL, DAMAGE, DOOR_GOD, ELITE, MIX, TOAD_KING, WOLF_LEADER, tempKind } from '../config';
import { EVOLVE } from '../content';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { submerged, underground, type Ball, type Body, type Elite, type Player, type SimState } from '../state';
import { hurtBoss } from './boss';
import { stat } from './build';
import { dropGem } from './drops';
import { gonged } from './demon';
import { shielded, tear } from './ghost';
import { inView, respawnPoint } from './horde';
import { resetMob } from './marsh';
import { split } from './snow';
import { bossThins, mobHp } from './waves';

// Hit targets and damage. Targets are numbered: the horde mobs first (by index), then the
// elites, then the boss, so a ball can remember "the one I hit last" as a plain integer.

/** Experience a mob is worth. */
export const MOB_GEM = 1;

/** The first elite's index; the elites run up to the boss's. */
export function eliteIndex(s: SimState): number {
  return s.mobs.length;
}

export function bossIndex(s: SimState): number {
  return s.mobs.length + s.elites.length;
}

/** Elite at target i, or null when i is a mob or the boss. */
export function eliteAt(s: SimState, i: number): Elite | null {
  return i >= s.mobs.length ? (s.elites[i - s.mobs.length] ?? null) : null;
}

/** Target i, or null if it is not there (an emerger under the ground, the boss lying defeated or under water, or no boss). */
export function targetAt(s: SimState, i: number): Body | null {
  if (i < s.mobs.length) return underground(s.mobs[i]) ? null : s.mobs[i];
  if (i < bossIndex(s)) return s.elites[i - s.mobs.length];
  if (i === bossIndex(s) && s.boss && s.boss.phase !== 'down' && !submerged(s.boss)) return s.boss;
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

/** The boss, else the nearest elite, within `range` of p and on p's screen (inView); -1 if none. */
export function bigTarget(s: SimState, p: Player, range: number): number {
  const boss = targetAt(s, bossIndex(s));
  if (boss && dist2(boss.x - p.x, boss.y - p.y) <= range * range && inView(p, boss.x, boss.y)) return bossIndex(s);
  let best = -1;
  let bestD = range * range;
  for (let i = eliteIndex(s); i < bossIndex(s); i++) {
    const t = targetAt(s, i)!;
    const d = dist2(t.x - p.x, t.y - p.y);
    if (d <= bestD && inView(p, t.x, t.y)) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** The mark a ball locked onto target i keeps: -1 the boss, the elite's id, 0 for a mob. */
export function markOf(s: SimState, i: number): number {
  if (i === bossIndex(s)) return -1;
  return eliteAt(s, i)?.id ?? 0;
}

/** Target number of mark `mark` (markOf), or -1 if it is gone or cannot be hit now. */
function markTarget(s: SimState, mark: number): number {
  if (mark === -1) return targetAt(s, bossIndex(s)) ? bossIndex(s) : -1;
  const k = s.elites.findIndex((e) => e.id === mark);
  return k >= 0 ? eliteIndex(s) + k : -1;
}

/** The boss, else the nearest elite, when in range (the relic locks onto them first), else the nearest target. */
export function kickTarget(s: SimState, p: Player, range: number): number {
  const big = bigTarget(s, p, range);
  return big >= 0 ? big : nearestTarget(s, p.x, p.y, range);
}

/**
 * Damages target i on behalf of player `by`, at `pct` percent of a base roll (the crit stat
 * raises the crit chance). Mobs lose health and at 0 go down (a gem drops, they respawn on the
 * ring with the wave's health), the elite loses health and is knocked back (the toad king
 * barely; none when `knock` is off: the staff keeps it in reach), the boss loses health.
 * A relic hit comes `from` a point (the ball's, else the one given): a door god's shield
 * facing it takes the hit whole, as does a fallen monk's gong. Spells give none, so they always land.
 */
export function damage(
  s: SimState, events: SimEvent[], i: number, by: Player, ball: Body | null, pct = 100, knock = true, from: { x: number; y: number } | null = null,
): void {
  const t = targetAt(s, i);
  if (!t) return;
  const src = ball ?? from;
  const shield = src ? eliteAt(s, i) : null;
  if (shield && shielded(shield, src!.x, src!.y)) {
    events.push({ type: 'block', index: i, x: t.x, y: t.y });
    return;
  }
  if (src && i < s.mobs.length && gonged(s, s.mobs[i], src.x, src.y)) {
    events.push({ type: 'block', index: i, x: t.x, y: t.y });
    return;
  }
  const crit = s.combat.chance(DAMAGE.critPercent + stat(by, 'crit'), 100);
  const roll = s.combat.range(DAMAGE.min, DAMAGE.max) * (crit ? DAMAGE.critMul : 1);
  const value = Math.max(1, Math.trunc((roll * pct * (100 + stat(by, 'attack'))) / 10000));
  const elite = eliteAt(s, i);
  const kind = i < s.mobs.length ? 'mob' : elite ? 'elite' : 'boss';
  events.push({ type: 'hit', kind, index: i, x: t.x, y: t.y, value, crit, ball: !!ball, bx: ball?.x ?? 0, by: ball?.y ?? 0 });
  if (kind === 'boss') {
    if (hurtBoss(s.boss!, value)) {
      s.boss!.phase = 'down';
      s.boss!.t = 0;
      events.push({ type: 'bossDown' });
    }
  } else if (elite) {
    // the sandbox keeps its elite for the readability tests; in a chapter it can fall
    const e = elite;
    if (s.config.waves > 0) e.hp = Math.max(0, e.hp - value);
    if (e.hp === 0) {
      events.push({ type: 'eliteDown', id: e.id, x: e.x, y: e.y });
      dropGem(s, e.x, e.y, ELITE.gem);
      s.elites.splice(i - s.mobs.length, 1);
      return;
    }
    if (!knock) return;
    const d = dist(t.x - by.x, t.y - by.y) || 1;
    const push = e.kind === 'toadKing' ? TOAD_KING.knockback : e.kind === 'wolfLeader' ? WOLF_LEADER.knockback : e.kind === 'doorGod' ? DOOR_GOD.knockback : ELITE.knockback;
    t.x += Math.trunc(((t.x - by.x) * push) / d);
    t.y += Math.trunc(((t.y - by.y) * push) / d);
  } else {
    const m = s.mobs[i];
    m.hp -= value;
    if (m.hp <= 0) downMob(s, events, i, by, true);
  }
}

/**
 * Mob i goes down (dropping its gem, unless swallowed; only some swarm mobs and shards leave
 * one) and respawns on the ring with the wave's health (an emerger goes under the ground to
 * rise again); a paper effigy tears into scraps as it goes. A skeleton, a shard or a scrap falls
 * for good, a skeleton splitting into shards. In a boss fight with the horde thinned enough
 * (WAVES.bossHordePercent) it rests at health 0 until the next wave.
 */
export function downMob(s: SimState, events: SimEvent[], i: number, by: Player, gem: boolean): void {
  const m = s.mobs[i];
  events.push({ type: 'mobDown', index: i, x: m.x, y: m.y, dx: m.x - by.x, dy: m.y - by.y });
  const few = m.kind === 'swarm' || m.kind === 'shard' || m.kind === 'scrap';
  if (gem && (!few || s.drop.chance(MIX.swarmGemPercent, 100))) dropGem(s, m.x, m.y, MOB_GEM);
  m.stun = 0;
  if (tempKind(m.kind)) {
    if (m.kind === 'skeleton') split(s, m.x, m.y);
    m.hp = 0;
    m.haste = 0;
    return;
  }
  if (m.kind === 'effigy') tear(s, m.x, m.y);
  if (bossThins(s)) {
    m.hp = 0;
    m.haste = 0;
    return;
  }
  m.hp = mobHp(s.wave, m.kind, s.config.chapter, s.config.hard);
  resetMob(s, m);
  respawnPoint(s.ai, by, m);
}

function aim(b: Ball, tx: number, ty: number): void {
  const d = dist(tx - b.x, ty - b.y) || 1;
  b.vx = Math.trunc(((tx - b.x) * BALL.speed) / d);
  b.vy = Math.trunc(((ty - b.y) * BALL.speed) / d);
}

/**
 * A ball from (x, y) at (tx, ty) that bounces `maxHits` times at `damagePct` percent; a `split`
 * ball (the awakened Meteor Ball) sends splinters at every bounce. A `mark` (markOf) makes it
 * fly at that boss or elite through the horde.
 */
export function launchBall(
  s: SimState, owner: number, x: number, y: number, tx: number, ty: number, maxHits: number, damagePct: number, split = false, mark = 0,
): Ball {
  const b: Ball = {
    id: s.nextId++, owner, x, y, px: x, py: y, vx: 0, vy: 0, hits: 0, maxHits, damage: damagePct, last: -1,
    travel: mark !== 0 ? BALL.lockRange : BALL.maxTravel, split, mark,
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
/** `mark` if ball b is on it, else -1. */
function reached(s: SimState, b: Ball, mark: number): number {
  const t = targetAt(s, mark)!;
  return dist2(t.x - b.x, t.y - b.y) <= BALL.hitRadius * BALL.hitRadius ? mark : -1;
}

export function ballSystem(s: SimState, events: SimEvent[]): void {
  const balls = s.balls;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    b.px = b.x;
    b.py = b.y;
    // a ball on its mark follows it through the horde; a mark gone (fallen, under water) lets go
    const mark = b.mark !== 0 ? markTarget(s, b.mark) : -1;
    if (b.mark !== 0 && mark < 0) b.mark = 0;
    if (mark >= 0) {
      const t = targetAt(s, mark)!;
      aim(b, t.x, t.y);
    }
    b.x += b.vx;
    b.y += b.vy;
    b.travel -= BALL.speed;
    let alive = b.travel > 0;
    const hit = mark >= 0 ? reached(s, b, mark) : nearestTarget(s, b.x, b.y, BALL.hitRadius, b.last);
    if (hit >= 0) {
      b.mark = 0;
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
