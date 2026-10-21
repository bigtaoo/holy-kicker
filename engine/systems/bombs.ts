import { BOMB, SPELL_CAST } from '../content';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Bomb, Player, SimState } from '../state';
import { bossIndex, damage, eliteIndex, nearestTarget, targetAt } from './combat';

// Thunder Fire, a cluster bomb: lobbed from the hero at the nearest enemy, it lands after
// BOMB.flight in a blast that hits everything inside and pushes the mobs that survive away
// from its centre (like the roar, mobs only), then scatters `split` bomblets in a star around
// it. A bomblet lands after BOMB.bombletFlight in a smaller, weaker blast and does not split.

/** Throws p's bomb; false when no enemy is in reach. */
export function throwBomb(s: SimState, events: SimEvent[], p: Player, split: number, radius: number, damagePct: number): boolean {
  const i = nearestTarget(s, p.x, p.y, BOMB.reach);
  if (i < 0) return false;
  const t = targetAt(s, i)!;
  launch(s, events, { owner: p.owner, x0: p.x, y0: p.y, x: t.x, y: t.y, t: BOMB.flight, radius, damage: damagePct, split });
  return true;
}

function launch(s: SimState, events: SimEvent[], b: Bomb): void {
  s.bombs.push(b);
  events.push({ type: 'bomb', owner: b.owner, x0: b.x0, y0: b.y0, x1: b.x, y1: b.y, flight: b.t, small: b.split === 0 });
}

function explode(s: SimState, events: SimEvent[], b: Bomb, small: boolean): void {
  const by = s.players.find((o) => o.owner === b.owner) ?? s.players[0];
  events.push({ type: 'boom', x: b.x, y: b.y, radius: b.radius, small });
  const r2 = b.radius * b.radius;
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (!t || dist2(t.x - b.x, t.y - b.y) >= r2) continue;
    const x0 = t.x;
    const y0 = t.y;
    damage(s, events, i, by, null, i >= eliteIndex(s) ? Math.trunc((b.damage * SPELL_CAST.bigPercent) / 100) : b.damage, false);
    // the big blast pushes a mob still standing where it was; one that fell respawned elsewhere
    const m = !small && i < s.mobs.length ? s.mobs[i] : null;
    if (!m || m.x !== x0 || m.y !== y0) continue;
    const d = dist(m.x - b.x, m.y - b.y) || 1;
    m.x += Math.trunc(((m.x - b.x) * BOMB.knockback) / d);
    m.y += Math.trunc(((m.y - b.y) * BOMB.knockback) / d);
  }
  if (b.split === 0) return;
  const a0 = s.spell.int(BRAD_FULL);
  const radius = Math.trunc((b.radius * BOMB.bombletRadiusPercent) / 100);
  const dmg = Math.trunc((b.damage * BOMB.bombletDamagePercent) / 100);
  for (let k = 0; k < b.split; k++) {
    const a = a0 + Math.trunc((k * BRAD_FULL) / b.split);
    const x = b.x + Math.trunc((cosB(a) * BOMB.scatter) / TRIG_ONE);
    const y = b.y + Math.trunc((sinB(a) * BOMB.scatter) / TRIG_ONE);
    launch(s, events, { owner: b.owner, x0: b.x, y0: b.y, x, y, t: BOMB.bombletFlight, radius, damage: dmg, split: 0 });
  }
}

export function bombSystem(s: SimState, events: SimEvent[]): void {
  const landed: Bomb[] = [];
  let w = 0;
  for (const b of s.bombs) {
    if (--b.t > 0) s.bombs[w++] = b;
    else landed.push(b);
  }
  s.bombs.length = w;
  // after the sweep, so the bomblets a blast scatters fly from the next tick
  for (const b of landed) explode(s, events, b, b.split === 0);
}
