import { EVOLVE, SPELL_CAST, TALISMAN } from '../content';
import type { SimEvent } from '../events';
import { dist2, toFp } from '../math/fixed';
import { atan2B, BRAD_FULL, BRAD_HALF, cosB, normBrad, sinB, TRIG_ONE } from '../math/trig';
import type { Player, SimState, Talisman } from '../state';
import { bossIndex, damage, eliteIndex, nearestTarget, targetAt } from './combat';

// Demon-Binding Talismans: `count` talismans fan out from the hero in an even star, then each
// turns toward its own enemy (the nearest ones in reach, a different one each while there are
// enough) at a limited turn rate and strikes the first enemy it touches, once. A target that
// fell respawns elsewhere at the same number, so a talisman whose target jumped picks the
// nearest enemy to itself instead. Elites and the boss take SPELL_CAST.bigPercent. Evolved
// (Heavenly Seal), a talisman that strikes bursts in a seal that hits everything else around
// at EVOLVE.sealPercent.

/** A target that moved further than this in one tick respawned: look for another. */
const JUMP = toFp(200);

/** Up to n target numbers within reach of p, nearest first (ties by number). */
export function nearestTargets(s: SimState, x: number, y: number, reach: number, n: number): number[] {
  const r2 = reach * reach;
  const found: { i: number; d: number }[] = [];
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (!t) continue;
    const d = dist2(t.x - x, t.y - y);
    if (d < r2) found.push({ i, d });
  }
  found.sort((a, b) => a.d - b.d || a.i - b.i);
  return found.slice(0, n).map((f) => f.i);
}

/** Sends p's talismans out, each bursting in a seal of radius `seal` (0 for none); false when no enemy is in reach. */
export function castTalismans(s: SimState, events: SimEvent[], p: Player, count: number, radius: number, life: number, damagePct: number, seal: number): boolean {
  const aims = nearestTargets(s, p.x, p.y, TALISMAN.reach, count);
  if (aims.length === 0) return false;
  const a0 = s.spell.int(BRAD_FULL);
  for (let k = 0; k < count; k++) {
    const target = aims[k % aims.length];
    const t = targetAt(s, target)!;
    const dir = normBrad(a0 + Math.trunc((k * BRAD_FULL) / count));
    s.talismans.push({ id: s.nextId++, owner: p.owner, x: p.x, y: p.y, px: p.x, py: p.y, dir, target, tx: t.x, ty: t.y, radius, damage: damagePct, age: 0, life, seal });
  }
  events.push({ type: 'talismans', owner: p.owner, x: p.x, y: p.y, count });
  return true;
}

/** Keeps the talisman's target, or finds it a new one when it fell; false when none is left. */
function track(s: SimState, q: Talisman): boolean {
  const t = targetAt(s, q.target);
  if (t && dist2(t.x - q.tx, t.y - q.ty) < JUMP * JUMP) {
    q.tx = t.x;
    q.ty = t.y;
    return true;
  }
  const i = nearestTarget(s, q.x, q.y, TALISMAN.reach);
  if (i < 0) return false;
  const n = targetAt(s, i)!;
  q.target = i;
  q.tx = n.x;
  q.ty = n.y;
  return true;
}

/** Turns `dir` toward `want` by at most `max` brads. */
function steer(dir: number, want: number, max: number): number {
  const off = normBrad(want - dir + BRAD_HALF) - BRAD_HALF;
  return normBrad(dir + Math.max(-max, Math.min(max, off)));
}

function big(s: SimState, i: number, pct: number): number {
  return i >= eliteIndex(s) ? Math.trunc((pct * SPELL_CAST.bigPercent) / 100) : pct;
}

/** A Heavenly Seal bursting at (x, y): hits every target in `radius` but the struck one. */
function burst(s: SimState, events: SimEvent[], by: Player, x: number, y: number, radius: number, struck: number, pct: number): void {
  events.push({ type: 'seal', x, y, radius });
  const r2 = radius * radius;
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (i === struck || !t || dist2(t.x - x, t.y - y) >= r2) continue;
    damage(s, events, i, by, null, big(s, i, pct), false);
  }
}

export function talismanSystem(s: SimState, events: SimEvent[]): void {
  let w = 0;
  for (const q of s.talismans) {
    const by = s.players.find((o) => o.owner === q.owner) ?? s.players[0];
    q.px = q.x;
    q.py = q.y;
    q.age++;
    let speed = TALISMAN.fanSpeed;
    if (q.age > TALISMAN.spread) {
      speed = TALISMAN.speed;
      if (track(s, q)) q.dir = steer(q.dir, atan2B(q.ty - q.y, q.tx - q.x), TALISMAN.turn);
    }
    q.x += Math.trunc((cosB(q.dir) * speed) / TRIG_ONE);
    q.y += Math.trunc((sinB(q.dir) * speed) / TRIG_ONE);
    const i = q.age > TALISMAN.spread ? nearestTarget(s, q.x, q.y, q.radius) : -1;
    if (i >= 0) {
      const t = targetAt(s, i)!;
      const x = t.x;
      const y = t.y;
      damage(s, events, i, by, null, big(s, i, q.damage));
      if (q.seal > 0) burst(s, events, by, x, y, q.seal, i, Math.trunc((q.damage * EVOLVE.sealPercent) / 100));
      continue;
    }
    if (q.age < q.life) s.talismans[w++] = q;
  }
  s.talismans.length = w;
}
