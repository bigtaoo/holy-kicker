import { KNIVES, SPELL_CAST } from '../content';
import type { SimEvent } from '../events';
import { dist2 } from '../math/fixed';
import { atan2B, BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Knife, Player, SimState } from '../state';
import { slotStats } from './build';
import { bossIndex, damage, eliteIndex, targetAt } from './combat';
import { nearestTargets } from './talismans';

// Blade Circle: every cooldown one more knife joins the circle turning around the hero, up to
// `count`, evenly spaced; a circling knife cuts what it touches, each target again after
// KNIVES.rehit. When the circle is full the next cast volleys it: every knife flies straight
// at one of the nearest enemies (a different one each while there are enough), piercing for
// KNIVES.life, and the circle grows again from nothing. Elites and the boss take
// SPELL_CAST.bigPercent. Evolved (Thousand Blades), a volleyed knife turns after KNIVES.life
// and flies back to its owner, cutting again on the way, and rejoins the circle; the circle
// volleys again once every knife is home.

/** Brads per tick for one turn every KNIVES.turn. */
const SPIN = Math.trunc(BRAD_FULL / KNIVES.turn);

function circling(s: SimState, owner: number): Knife[] {
  return s.knives.filter((k) => k.owner === owner && !k.flying);
}

function returning(s: SimState, owner: number): number {
  return s.knives.filter((k) => k.owner === owner && k.flying && k.returns).length;
}

/** Where a circling knife in `slot` of `count` stands this tick. */
function place(s: SimState, k: Knife, p: Player, count: number): void {
  const a = (s.tick * SPIN + Math.trunc((k.slot * BRAD_FULL) / count)) % BRAD_FULL;
  k.x = p.x + Math.trunc((cosB(a) * KNIVES.orbit) / TRIG_ONE);
  k.y = p.y + Math.trunc((sinB(a) * KNIVES.orbit) / TRIG_ONE);
}

/**
 * Adds a knife to p's circle, or volleys the full circle (knives that `come back` when evolved);
 * false when it is full with nothing in reach, or still waiting for knives on their way back.
 */
export function castKnives(s: SimState, events: SimEvent[], p: Player, count: number, radius: number, damagePct: number, comeBack: boolean): boolean {
  const mine = circling(s, p.owner);
  const away = returning(s, p.owner);
  if (mine.length + away < count) {
    const k: Knife = { id: s.nextId++, owner: p.owner, x: 0, y: 0, px: 0, py: 0, slot: mine.length, vx: 0, vy: 0, flying: false, returns: false, radius, damage: damagePct, age: 0, hit: [] };
    place(s, k, p, count);
    k.px = k.x;
    k.py = k.y;
    s.knives.push(k);
    return true;
  }
  if (away > 0) return false;
  const aims = nearestTargets(s, p.x, p.y, KNIVES.reach, mine.length);
  if (aims.length === 0) return false;
  mine.forEach((k, n) => {
    const t = targetAt(s, aims[n % aims.length])!;
    const a = atan2B(t.y - k.y, t.x - k.x);
    k.flying = true;
    k.returns = comeBack;
    k.age = 0;
    k.hit.length = 0;
    k.vx = Math.trunc((cosB(a) * KNIVES.speed) / TRIG_ONE);
    k.vy = Math.trunc((sinB(a) * KNIVES.speed) / TRIG_ONE);
  });
  events.push({ type: 'volley', owner: p.owner, x: p.x, y: p.y, count: mine.length });
  return true;
}

export function knifeSystem(s: SimState, events: SimEvent[]): void {
  let w = 0;
  for (const k of s.knives) {
    const by = s.players.find((o) => o.owner === k.owner) ?? s.players[0];
    k.px = k.x;
    k.py = k.y;
    k.age++;
    if (k.flying && k.returns && k.age >= KNIVES.life) {
      // on its way back: a fresh cut for everything it passes, then home to the circle
      if (k.age === KNIVES.life) k.hit.length = 0;
      if (dist2(by.x - k.x, by.y - k.y) <= KNIVES.orbit * KNIVES.orbit) rejoin(s, k, by);
      else steerHome(k, by);
    }
    if (k.flying) {
      k.x += k.vx;
      k.y += k.vy;
    } else {
      const slot = by.spells.find((sp) => sp.id === 'knives');
      const count = Math.max(k.slot + 1, slot ? slotStats(slot).count : 0);
      place(s, k, by, count);
      if (k.age % KNIVES.rehit === 0) k.hit.length = 0;
    }
    // a downed hero's circle turns without cutting
    if (!(by.dead && !k.flying)) cut(s, events, k, by);
    if (!k.flying || k.returns || k.age < KNIVES.life) s.knives[w++] = k;
  }
  s.knives.length = w;
}

function steerHome(k: Knife, by: Player): void {
  const a = atan2B(by.y - k.y, by.x - k.x);
  k.vx = Math.trunc((cosB(a) * KNIVES.speed) / TRIG_ONE);
  k.vy = Math.trunc((sinB(a) * KNIVES.speed) / TRIG_ONE);
}

/** A knife back home takes the next free place in the circle (it was empty when they flew). */
function rejoin(s: SimState, k: Knife, by: Player): void {
  const slot = s.knives.filter((o) => o.owner === k.owner && !o.flying).length;
  k.flying = false;
  k.returns = false;
  k.slot = slot;
  k.age = 0;
  k.vx = 0;
  k.vy = 0;
  k.hit.length = 0;
  const sp = by.spells.find((o) => o.id === 'knives');
  place(s, k, by, Math.max(slot + 1, sp ? slotStats(sp).count : 0));
}

function cut(s: SimState, events: SimEvent[], k: Knife, by: Player): void {
  const r2 = k.radius * k.radius;
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (!t || dist2(t.x - k.x, t.y - k.y) >= r2 || k.hit.includes(i)) continue;
    k.hit.push(i);
    damage(s, events, i, by, null, i >= eliteIndex(s) ? Math.trunc((k.damage * SPELL_CAST.bigPercent) / 100) : k.damage, false);
  }
}
