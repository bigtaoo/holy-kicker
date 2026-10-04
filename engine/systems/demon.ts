import { DEMON, HURT, MONK, THREATS } from '../config';
import type { RelicId } from '../content';
import type { SimEvent } from '../events';
import { dist } from '../math/fixed';
import { atan2B, BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Boss, Mob, Player, SimState } from '../state';
import { nearestPlayer } from './horde';
import { fan, ring } from './threats';

// Chapter 5's mechanics (docs/content.md "Chapters", Demon Peak): the fallen monk, a shielder
// mob, holds a gong toward its nearest hero that takes his relic's hits (spells still land)
// until it cracks; and the Inner Demon, the last boss, a cold copy of the hero that circles
// him and in turn turns his own relic against him (as bullets and a leap, so it reads like the
// relic in enemy violet) or casts a dark spell of zones around him.

/**
 * True when a relic hit coming from (x, y) is taken by mob m's gong: a fallen monk with blocks
 * left, its nearest hero within MONK.blockHalf of the hit's source as seen from it. Each block
 * spends one (m.t counts them down).
 */
export function gonged(s: SimState, m: Mob, x: number, y: number): boolean {
  if (m.kind !== 'monk' || m.t <= 0) return false;
  const p = nearestPlayer(s.players, m.x, m.y);
  const hx = p.x - m.x;
  const hy = p.y - m.y;
  const dh = dist(hx, hy);
  if (dh === 0) return false;
  // the way to the hero as a unit vector in TRIG_ONE, against the way to the hit
  const ux = Math.trunc((hx * TRIG_ONE) / dh);
  const uy = Math.trunc((hy * TRIG_ONE) / dh);
  const rx = x - m.x;
  const ry = y - m.y;
  if (ux * rx + uy * ry < cosB(MONK.blockHalf) * dist(rx, ry)) return false;
  m.t--;
  return true;
}

/** Below DEMON.ragePercent of its health it rests less. */
export function demonRage(b: Boss): boolean {
  return b.hp * 100 <= b.maxHp * DEMON.ragePercent;
}

/** Steps an Inner Demon that is not down; `target` is the nearest player, whose relic it uses. */
export function stepDemon(s: SimState, b: Boss, target: Player, events: SimEvent[]): void {
  const k = DEMON;
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const d = dist(dx, dy);
  if (b.phase === 'walk') {
    circle(b, dx, dy, d);
    if (--b.cooldown > 0 || target.dead || d > k.range) return;
    b.phase = 'windup';
    b.t = 0;
    events.push({ type: 'bossWindup' });
    return;
  }
  const relic = target.relicId;
  if (b.phase === 'windup') {
    if (b.t < k.windup) return;
    b.phase = 'recover';
    b.t = 0;
    // shots counts attacks: the even ones are the relic, the odd ones the spell
    if (b.shots++ % 2 === 1) {
      spell(s, target);
    } else if (relic === 'staff') {
      // the circle it will land in
      b.zoneX = target.x;
      b.zoneY = target.y;
      s.zones.push({ x: b.zoneX, y: b.zoneY, radius: k.leapRadius, age: 0, hurt: HURT.demonLeap });
    } else {
      volley(s, b, target, relic, 0);
    }
    events.push({ type: 'bossCast', x: b.x, y: b.y });
    return;
  }
  // recover: the relic attack plays out
  const relicTurn = b.shots % 2 === 1;
  if (relicTurn && relic === 'staff') {
    if (b.t <= THREATS.warn) {
      // it leaps, coming down as the circle goes off
      const left = THREATS.warn - b.t + 1;
      b.x += Math.trunc((b.zoneX - b.x) / left);
      b.y += Math.trunc((b.zoneY - b.y) / left);
    }
    if (b.t === THREATS.warn) {
      ring(s, b.x, b.y, k.leapRadius, k.leapRing, s.tick);
      events.push({ type: 'bossSlam', x: b.x, y: b.y, radius: k.leapRadius });
    }
  } else if (relicTurn) {
    volley(s, b, target, relic, b.t);
  }
  if (b.t >= k.recover && (!relicTurn || relic !== 'staff' || b.t > THREATS.warn)) {
    b.phase = 'walk';
    b.t = 0;
    b.cooldown = demonRage(b) ? k.rageCooldown : k.cooldown;
  }
}

/** Keeps stopDist from the hero, sidestepping round him (the way turns every two attacks). */
function circle(b: Boss, dx: number, dy: number, d: number): void {
  const k = DEMON;
  if (d === 0) return;
  const radial = Math.max(-k.speed, Math.min(k.speed, d - k.stopDist));
  const side = ((b.shots >> 1) & 1) === 0 ? 1 : -1;
  const tangent = Math.trunc((k.speed * 3) / 4) * side;
  b.x += Math.trunc((dx * radial - dy * tangent) / d);
  b.y += Math.trunc((dy * radial + dx * tangent) / d);
}

/** The part of relic `relic`'s volley that goes out `t` ticks into the recovery. */
function volley(s: SimState, b: Boss, target: Player, relic: RelicId, t: number): void {
  const k = DEMON;
  if (relic === 'ball') {
    if (t % k.volleyGap === 0 && t / k.volleyGap < k.volleys) fan(s, b.x, b.y, target.x, target.y, k.ballFan);
  } else if (relic === 'fish') {
    // each wave turned half a gap, so the next one's bullets fly through the last one's gaps
    const n = t / k.waveGap;
    if (t % k.waveGap === 0 && n < k.waves) ring(s, b.x, b.y, 0, k.waveRing, aimAt(b, target) + Math.trunc((n * BRAD_FULL) / (2 * k.waveRing)));
  } else if (relic === 'beads') {
    const n = t / k.spiralGap;
    if (t % k.spiralGap === 0 && n < k.spiral) ring(s, b.x, b.y, 0, k.spiralRing, aimAt(b, target) + n * k.spiralTurn);
  } else if (relic === 'bowl') {
    if (t === 0) fan(s, b.x, b.y, target.x, target.y, k.bowlFan);
  }
}

function aimAt(b: Boss, target: Player): number {
  return atan2B(target.y - b.y, target.x - b.x);
}

/** A dark spell: DEMON.spell zones, one on the hero and the rest around him. */
function spell(s: SimState, target: Player): void {
  const k = DEMON;
  s.zones.push({ x: target.x, y: target.y, radius: k.spellRadius, age: 0, hurt: HURT.demonSpell });
  const a0 = s.ai.int(BRAD_FULL);
  for (let j = 1; j < k.spell; j++) {
    const a = a0 + Math.trunc((j * BRAD_FULL) / (k.spell - 1));
    const r = s.ai.range(k.spellRadius, k.spellSpread);
    s.zones.push({
      x: target.x + Math.trunc((cosB(a) * r) / TRIG_ONE),
      y: target.y + Math.trunc((sinB(a) * r) / TRIG_ONE),
      radius: k.spellRadius,
      age: 0,
      hurt: HURT.demonSpell,
    });
  }
}
