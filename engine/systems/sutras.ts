import { HALO, LOTUS, ROAR, SPELL_CAST } from '../content';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { atan2B, BRAD_FULL, BRAD_HALF, normBrad } from '../math/trig';
import type { Lotus, Player, SimState } from '../state';
import { lasting, slotStats, stat } from './build';
import { bossIndex, damage, eliteIndex, nearestTarget, targetAt } from './combat';
import { pullGems } from './drops';

// The spells a sutra adds to the pool (docs/content.md "Spells"). Lotus Steps: while the hero
// walks he leaves lotus seeds that arm after a moment and bloom when an enemy steps on one, so
// the horde following him runs into them; a seed whose time is up blooms too if an enemy is
// within its bloom, else it withers. Lotus Path drops one at
// almost every step and each bloom sends the gems near it to the hero. Halo Beam: beams turn around the hero for good and
// hit what they sweep over, longer while he stands still; Boundless Light has three. Lion's
// Roar: a cone shout at the nearest enemy that pushes the mobs it does not fell back;
// Thunder Roar goes all the way round and shatters the bullets it reaches. Like every spell,
// they deal SPELL_CAST.bigPercent of their damage to the elite and the boss.

function share(s: SimState, i: number, damagePct: number): number {
  return i < eliteIndex(s) ? damagePct : Math.trunc((damagePct * SPELL_CAST.bigPercent) / 100);
}

/** A radius grown by the area stat. */
function grown(p: Player, radius: number): number {
  return Math.trunc((radius * (100 + stat(p, 'area'))) / 100);
}

/** Drops a lotus seed where p stands; false while he stands still. */
export function dropLotus(s: SimState, p: Player, radius: number, life: number, damagePct: number, pull: boolean): boolean {
  if (!p.moving) return false;
  s.lotuses.push({ id: s.nextId++, owner: p.owner, x: p.x, y: p.y, radius: grown(p, radius), damage: damagePct, age: 0, life: lasting(p, life), pull });
  return true;
}

function inBloom(s: SimState, l: Lotus): boolean {
  return nearestTarget(s, l.x, l.y, l.radius) >= 0;
}

/** The seed opens: everything within its radius is hit; Lotus Path pulls the gems near it. */
function bloom(s: SimState, events: SimEvent[], l: Lotus): void {
  const by = s.players.find((q) => q.owner === l.owner) ?? s.players[0];
  events.push({ type: 'bloom', x: l.x, y: l.y, radius: l.radius });
  const r2 = l.radius * l.radius;
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (t && dist2(t.x - l.x, t.y - l.y) < r2) damage(s, events, i, by, null, share(s, i, l.damage));
  }
  if (l.pull && !by.dead) pullGems(s, by, l.x, l.y, LOTUS.pull);
}

/** Ages every seed; an armed one an enemy stands on blooms, and so does one at its time with an enemy near. */
export function lotusSystem(s: SimState, events: SimEvent[]): void {
  let w = 0;
  for (const l of s.lotuses) {
    l.age++;
    const stepped = l.age >= LOTUS.arm && nearestTarget(s, l.x, l.y, LOTUS.trigger) >= 0;
    if (stepped || (l.age >= l.life && inBloom(s, l))) {
      bloom(s, events, l);
      continue;
    }
    if (l.age < l.life) s.lotuses[w++] = l;
  }
  s.lotuses.length = w;
}

/** Brads the halo turns per tick: one turn per `life`, quicker with the cooldown stat. */
export function haloSpin(p: Player, turn: number): number {
  const t = Math.max(1, Math.trunc((turn * (100 - stat(p, 'cooldown'))) / 100));
  return Math.max(1, Math.trunc(BRAD_FULL / t));
}

/** The halo's beam length now: full while standing, shorter on the move. */
export function haloLength(p: Player, radius: number): number {
  const r = grown(p, radius);
  return p.moving ? Math.trunc((r * HALO.movingPercent) / 100) : r;
}

/** Turns every hero's halo one tick; each beam hits what it swept over. */
export function haloSystem(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) {
    const slot = p.spells.find((sp) => sp.id === 'halo');
    if (!slot) continue;
    const l = slotStats(slot);
    const spin = haloSpin(p, l.life);
    const from = p.halo;
    p.halo = normBrad(from + spin);
    if (p.dead) continue;
    const len = haloLength(p, l.radius);
    const len2 = len * len;
    for (let i = 0; i <= bossIndex(s); i++) {
      const t = targetAt(s, i);
      if (!t || dist2(t.x - p.x, t.y - p.y) > len2) continue;
      const a = atan2B(t.y - p.y, t.x - p.x);
      for (let k = 0; k < l.count; k++) {
        const beam = from + Math.trunc((k * BRAD_FULL) / l.count);
        if (normBrad(a - beam) >= spin) continue;
        damage(s, events, i, p, null, share(s, i, l.damage));
        break;
      }
    }
  }
}

/** Lion's Roar from p at the nearest enemy in reach; false when there is none. */
export function roar(s: SimState, events: SimEvent[], p: Player, radius: number, damagePct: number, full: boolean): boolean {
  const r = grown(p, radius);
  const r2 = r * r;
  const near = nearestTarget(s, p.x, p.y, r);
  if (near < 0) return false;
  const aim = targetAt(s, near)!;
  const brad = normBrad(atan2B(aim.y - p.y, aim.x - p.x));
  const hits: number[] = [];
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (!t || dist2(t.x - p.x, t.y - p.y) > r2) continue;
    if (!full) {
      const off = normBrad(atan2B(t.y - p.y, t.x - p.x) - brad + BRAD_HALF) - BRAD_HALF;
      if (off > ROAR.half || off < -ROAR.half) continue;
    }
    hits.push(i);
  }
  events.push({ type: 'roar', owner: p.owner, x: p.x, y: p.y, brad, radius: r, full });
  for (const i of hits) {
    const t = targetAt(s, i);
    if (!t) continue;
    const x0 = t.x;
    const y0 = t.y;
    damage(s, events, i, p, null, share(s, i, damagePct));
    // a mob still standing where it was is pushed back; one that fell respawned elsewhere
    const m = i < s.mobs.length ? s.mobs[i] : null;
    if (!m || m.x !== x0 || m.y !== y0) continue;
    const d = dist(m.x - p.x, m.y - p.y) || 1;
    m.x += Math.trunc(((m.x - p.x) * ROAR.knockback) / d);
    m.y += Math.trunc(((m.y - p.y) * ROAR.knockback) / d);
  }
  if (full) s.bullets = s.bullets.filter((b) => dist2(b.x - p.x, b.y - p.y) > r2);
  return true;
}
