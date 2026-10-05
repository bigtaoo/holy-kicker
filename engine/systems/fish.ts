import { FISH } from '../content';
import type { SimEvent } from '../events';
import { dist2 } from '../math/fixed';
import type { Player, SimState } from '../state';
import { fishLevel, relicPct } from './build';
import { bossIndex, damage, eliteAt, targetAt } from './combat';

// The wooden fish relic (docs/content.md "Relics"): every tap sends a sound ring out from the
// hero; it grows to its reach and hits each enemy it passes once, the elite and the boss at
// full relic damage. Awakened (Stunning Bell) the ring reaches further and every fourth one
// stuns the mobs and the elite it passes (systems/horde.ts holds them).

/** How close a target has to be for the hero to tap. */
export function fishStart(p: Player): number {
  return Math.trunc((fishLevel(p).reach * FISH.startPercent) / 100);
}

/** The mallet lands: a ring starts at the hero's feet. */
export function tap(s: SimState, events: SimEvent[], p: Player): void {
  const lv = fishLevel(p);
  p.taps++;
  const stun = p.awakened && p.taps % FISH.stunEvery === 0 ? FISH.stun : 0;
  s.rings.push({ id: s.nextId++, owner: p.owner, x: p.x, y: p.y, radius: 0, reach: lv.reach, damage: relicPct(p, lv.damage), stun, hit: [] });
  events.push({ type: 'ring', owner: p.owner, x: p.x, y: p.y, reach: lv.reach, stun: stun > 0 });
}

/** Grows every ring one tick and hits what it reached; a ring at its reach is gone. */
export function ringSystem(s: SimState, events: SimEvent[]): void {
  let w = 0;
  for (const r of s.rings) {
    const by = s.players.find((q) => q.owner === r.owner) ?? s.players[0];
    r.radius = Math.min(r.reach, r.radius + FISH.ringSpeed);
    const r2 = r.radius * r.radius;
    // gathered first: a mob that goes down respawns elsewhere and must not be hit twice
    const hits: number[] = [];
    for (let i = 0; i <= bossIndex(s); i++) {
      const t = targetAt(s, i);
      if (!t || dist2(t.x - r.x, t.y - r.y) > r2 || r.hit.includes(i)) continue;
      r.hit.push(i);
      hits.push(i);
    }
    for (const i of hits) {
      const e = eliteAt(s, i);
      if (r.stun > 0 && i < s.mobs.length) s.mobs[i].stun = r.stun;
      else if (r.stun > 0 && e) e.stun = r.stun;
      damage(s, events, i, by, null, r.damage, false, r);
    }
    if (r.radius < r.reach) s.rings[w++] = r;
  }
  s.rings.length = w;
}
