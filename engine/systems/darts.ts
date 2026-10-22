import { SPELL_CAST } from '../content';
import type { SimEvent } from '../events';
import { dist2 } from '../math/fixed';
import { atan2B, BRAD_HALF, cosB, normBrad, sinB, TRIG_ONE } from '../math/trig';
import type { Dart, Player, SimState } from '../state';
import { bossIndex, damage, eliteIndex, nearestTarget, targetAt } from './combat';

// Darts: the small piercing shots of the sutra spells, the Halo Beam's needles and the Lotus
// Steps' petals (systems/sutras.ts). A dart flies straight at its speed for its life and hits
// each target it passes once, the elite and the boss at the spells' reduced share; a homing
// one (Lotus Path's petals) turns at most `turn` brads a tick toward the nearest target it has
// not hit yet.

export interface DartShot {
  kind: Dart['kind'];
  speed: number;
  life: number;
  radius: number;
  damage: number;
  /** Brads a tick a homing dart turns, 0 for a straight one. */
  turn: number;
}

/** A dart of p's from (x, y) heading `dir`. */
export function shootDart(s: SimState, p: Player, x: number, y: number, dir: number, shot: DartShot): void {
  s.darts.push({
    id: s.nextId++, owner: p.owner, kind: shot.kind, x, y, px: x, py: y, dir: normBrad(dir), speed: shot.speed, turn: shot.turn,
    radius: shot.radius, damage: shot.damage, age: 0, life: shot.life, hit: [],
  });
}

/** Turns `dir` toward `want` by at most `max` brads. */
function steer(dir: number, want: number, max: number): number {
  const off = normBrad(want - dir + BRAD_HALF) - BRAD_HALF;
  return normBrad(dir + Math.max(-max, Math.min(max, off)));
}

/** Flies every dart one tick and hits what it touches. */
export function dartSystem(s: SimState, events: SimEvent[]): void {
  let w = 0;
  for (const d of s.darts) {
    const by = s.players.find((q) => q.owner === d.owner) ?? s.players[0];
    d.px = d.x;
    d.py = d.y;
    d.age++;
    if (d.turn > 0) {
      const i = nearestTarget(s, d.x, d.y, d.speed * (d.life - d.age + 1), d.hit);
      const t = i >= 0 ? targetAt(s, i) : null;
      if (t) d.dir = steer(d.dir, atan2B(t.y - d.y, t.x - d.x), d.turn);
    }
    d.x += Math.trunc((cosB(d.dir) * d.speed) / TRIG_ONE);
    d.y += Math.trunc((sinB(d.dir) * d.speed) / TRIG_ONE);
    const r2 = d.radius * d.radius;
    for (let i = 0; i <= bossIndex(s); i++) {
      const t = targetAt(s, i);
      if (!t || dist2(t.x - d.x, t.y - d.y) >= r2 || d.hit.includes(i)) continue;
      d.hit.push(i);
      damage(s, events, i, by, null, i >= eliteIndex(s) ? Math.trunc((d.damage * SPELL_CAST.bigPercent) / 100) : d.damage, false);
    }
    if (d.age < d.life) s.darts[w++] = d;
  }
  s.darts.length = w;
}
