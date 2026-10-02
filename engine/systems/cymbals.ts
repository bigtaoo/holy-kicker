import { EVOLVE, SPELL_CAST } from '../content';
import type { SimEvent } from '../events';
import { dist2 } from '../math/fixed';
import { atan2B, BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Cymbal, Player, SimState } from '../state';
import { bossIndex, damage, eliteIndex, nearestTarget, targetAt } from './combat';

// Flying Cymbals: `count` cymbals thrown out in an even star around the hero, the first at the
// nearest enemy. Each flies straight for its life and hits everything it passes once, the
// elite and the boss at the spells' reduced share. The evolved Cymbal Wheel keeps `count`
// cymbals circling the hero for good instead; each hits a target again after EVOLVE.wheelRehit.

/** Brads per tick for one turn every EVOLVE.wheelTurn. */
const WHEEL_SPIN = Math.trunc(BRAD_FULL / EVOLVE.wheelTurn);

/** Throws the cymbals; false when no enemy is in reach to aim at. */
export function throwCymbals(s: SimState, p: Player, count: number, radius: number, life: number, damagePct: number): boolean {
  const t = nearestTarget(s, p.x, p.y, SPELL_CAST.cymbalReach);
  if (t < 0) return false;
  const aim = targetAt(s, t)!;
  const a0 = atan2B(aim.y - p.y, aim.x - p.x);
  for (let k = 0; k < count; k++) {
    const a = a0 + Math.trunc((k * BRAD_FULL) / count);
    s.cymbals.push({
      id: s.nextId++, owner: p.owner, x: p.x, y: p.y, px: p.x, py: p.y,
      vx: Math.trunc((cosB(a) * SPELL_CAST.cymbalSpeed) / TRIG_ONE),
      vy: Math.trunc((sinB(a) * SPELL_CAST.cymbalSpeed) / TRIG_ONE),
      radius, damage: damagePct, age: 0, life, hit: [], orbit: 0, angle: 0,
    });
  }
  return true;
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
      radius, damage: damagePct, age: 0, life: 0, hit: [], orbit: EVOLVE.wheelOrbit, angle: Math.trunc((k * BRAD_FULL) / count),
    };
    orbitAt(c, p);
    c.px = c.x;
    c.py = c.y;
    s.cymbals.push(c);
  }
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
    } else {
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
    for (let i = 0; i <= n; i++) {
      const t = targetAt(s, i);
      if (!t || dist2(t.x - c.x, t.y - c.y) >= r2 || c.hit.includes(i)) continue;
      c.hit.push(i);
      const pct = i >= eliteIndex(s) ? Math.trunc((c.damage * SPELL_CAST.bigPercent) / 100) : c.damage;
      damage(s, events, i, by, null, pct);
    }
    if (c.orbit > 0 || c.age < c.life) s.cymbals[w++] = c;
  }
  s.cymbals.length = w;
}
