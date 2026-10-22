import { EVOLVE, SPELL_CAST } from '../content';
import type { SimEvent } from '../events';
import { dist2 } from '../math/fixed';
import { atan2B, BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Cymbal, Player, SimState } from '../state';
import { bossIndex, damage, eliteIndex, nearestTarget, targetAt } from './combat';
import { nearestTargets } from './talismans';

// Flying Cymbals: `count` cymbals thrown one after another (SPELL_CAST.cymbalStagger), each at
// one of the nearest enemies. Each flies straight and hits everything it passes once, the
// elite and the boss at the spells' reduced share; striking the enemy it was thrown at, it
// ricochets to the nearest one it has not hit, up to SPELL_CAST.cymbalBounces times. The evolved
// Cymbal Wheel keeps `count` cymbals circling the hero for good, each hitting a target again
// after EVOLVE.wheelRehit, and flings a ricocheting cymbal from its rim at every cast.

/** Brads per tick for one turn every EVOLVE.wheelTurn. */
const WHEEL_SPIN = Math.trunc(BRAD_FULL / EVOLVE.wheelTurn);

/** Sets c flying from where it is at target i. */
function aimAt(s: SimState, c: Cymbal, i: number): void {
  const t = targetAt(s, i)!;
  const a = atan2B(t.y - c.y, t.x - c.x);
  c.vx = Math.trunc((cosB(a) * SPELL_CAST.cymbalSpeed) / TRIG_ONE);
  c.vy = Math.trunc((sinB(a) * SPELL_CAST.cymbalSpeed) / TRIG_ONE);
  c.aim = i;
}

/** Throws `count` cymbals from (x, y), each at one of the nearest enemies (round again when there are fewer); false when none is in reach. */
export function throwCymbals(s: SimState, p: Player, count: number, radius: number, life: number, damagePct: number, x = p.x, y = p.y): boolean {
  const aims = nearestTargets(s, x, y, SPELL_CAST.cymbalReach, count);
  if (aims.length === 0) return false;
  for (let k = 0; k < count; k++) {
    const c: Cymbal = {
      id: s.nextId++, owner: p.owner, x, y, px: x, py: y, vx: 0, vy: 0,
      radius, damage: damagePct, age: -k * SPELL_CAST.cymbalStagger, life, hit: [], orbit: 0, angle: 0, aim: -1, bounces: SPELL_CAST.cymbalBounces,
    };
    aimAt(s, c, aims[k % aims.length]);
    s.cymbals.push(c);
  }
  return true;
}

/** The Cymbal Wheel flings one ricocheting cymbal from the rim nearest the nearest enemy. */
export function flingCymbal(s: SimState, p: Player, radius: number, life: number, damagePct: number): boolean {
  const i = nearestTarget(s, p.x, p.y, SPELL_CAST.cymbalReach);
  if (i < 0) return false;
  const t = targetAt(s, i)!;
  let from: Cymbal | null = null;
  for (const c of s.cymbals) if (c.owner === p.owner && c.orbit > 0 && (!from || dist2(t.x - c.x, t.y - c.y) < dist2(t.x - from.x, t.y - from.y))) from = c;
  return throwCymbals(s, p, 1, radius, life, damagePct, from?.x ?? p.x, from?.y ?? p.y);
}

function orbitAt(c: Cymbal, p: Player): void {
  c.x = p.x + Math.trunc((cosB(c.angle) * c.orbit) / TRIG_ONE);
  c.y = p.y + Math.trunc((sinB(c.angle) * c.orbit) / TRIG_ONE);
}

/**
 * Makes sure p's wheel has `count` cymbals evenly spaced (it is spun up once, or again after
 * the count changed); false when it already turns, so the cooldown just checks again later.
 */
export function spinWheel(s: SimState, p: Player, count: number, radius: number, damagePct: number): boolean {
  const mine = s.cymbals.filter((c) => c.owner === p.owner && c.orbit > 0);
  if (mine.length === count) return false;
  s.cymbals = s.cymbals.filter((c) => !(c.owner === p.owner && c.orbit > 0));
  for (let k = 0; k < count; k++) {
    const c: Cymbal = {
      id: s.nextId++, owner: p.owner, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
      radius, damage: damagePct, age: 0, life: 0, hit: [], orbit: EVOLVE.wheelOrbit, angle: Math.trunc((k * BRAD_FULL) / count), aim: -1, bounces: 0,
    };
    orbitAt(c, p);
    c.px = c.x;
    c.py = c.y;
    s.cymbals.push(c);
  }
  return true;
}

/** Sends c on from the target it struck to the nearest one it has not hit; false when there is none. */
function ricochet(s: SimState, events: SimEvent[], c: Cymbal): boolean {
  const next = nearestTarget(s, c.x, c.y, SPELL_CAST.cymbalBounceReach, c.hit);
  if (next < 0) return false;
  aimAt(s, c, next);
  c.bounces--;
  c.age = 0;
  events.push({ type: 'clang', x: c.x, y: c.y });
  return true;
}

/** Flies every cymbal one tick and hits what it touches. */
export function cymbalSystem(s: SimState, events: SimEvent[]): void {
  let w = 0;
  for (const c of s.cymbals) {
    const by = s.players.find((q) => q.owner === c.owner) ?? s.players[0];
    c.px = c.x;
    c.py = c.y;
    c.age++;
    if (c.orbit > 0) {
      c.angle = (c.angle + WHEEL_SPIN) % BRAD_FULL;
      orbitAt(c, by);
      if (c.age % EVOLVE.wheelRehit === 0) c.hit.length = 0;
    } else if (c.age <= 0) {
      // waiting its turn in the hero's hand
      c.x = c.px = by.x;
      c.y = c.py = by.y;
      s.cymbals[w++] = c;
      continue;
    } else {
      // leaving the hand (or the struck enemy): set off at where the target stands now
      if (c.age === 1 && targetAt(s, c.aim)) aimAt(s, c, c.aim);
      c.x += c.vx;
      c.y += c.vy;
    }
    // a downed hero's wheel turns without hitting
    if (by.dead && c.orbit > 0) {
      s.cymbals[w++] = c;
      continue;
    }
    const r2 = c.radius * c.radius;
    const n = bossIndex(s);
    let struck = false;
    for (let i = 0; i <= n; i++) {
      const t = targetAt(s, i);
      if (!t || dist2(t.x - c.x, t.y - c.y) >= r2 || c.hit.includes(i)) continue;
      c.hit.push(i);
      if (i === c.aim) struck = true;
      const pct = i >= eliteIndex(s) ? Math.trunc((c.damage * SPELL_CAST.bigPercent) / 100) : c.damage;
      damage(s, events, i, by, null, pct);
    }
    if (struck && c.bounces > 0) ricochet(s, events, c);
    if (c.orbit > 0 || c.age < c.life) s.cymbals[w++] = c;
  }
  s.cymbals.length = w;
}
