import { BEADS, type BeadsRing } from '../content';
import type { SimEvent } from '../events';
import { dist2 } from '../math/fixed';
import { BRAD_FULL, cosB, sinB, TRIG_ONE } from '../math/trig';
import type { Bead, Player, SimState } from '../state';
import { beadsRings, relicPct } from './build';
import { bossIndex, damage, targetAt } from './combat';

// The prayer beads relic (docs/content.md "Relics"): the beads circle the hero for good and
// hit each enemy they touch once per pass, the elite and the boss at full relic damage, with
// no knockback (the big ones stay on the ring). Awakened (108 Beads) a second ring circles
// further out the other way. The hero never swings: kickSystem leaves a beads player alone.

function place(b: Bead, p: Player, orbit: number): void {
  b.x = p.x + Math.trunc((cosB(b.angle) * orbit) / TRIG_ONE);
  b.y = p.y + Math.trunc((sinB(b.angle) * orbit) / TRIG_ONE);
}

/** Lays out p's beads anew when the count changed (a level-up), keeping each ring's first angle. */
function lay(s: SimState, p: Player, rings: readonly BeadsRing[]): void {
  const mine = s.beads.filter((b) => b.owner === p.owner);
  const total = rings.reduce((n, r) => n + r.count, 0);
  if (mine.length === total && rings.every((r, k) => mine.filter((b) => b.ring === k).length === r.count)) return;
  s.beads = s.beads.filter((b) => b.owner !== p.owner);
  rings.forEach((r, k) => {
    const a0 = mine.find((b) => b.ring === k)?.angle ?? Math.trunc((k * BRAD_FULL) / (2 * r.count));
    for (let i = 0; i < r.count; i++) {
      const b: Bead = { id: s.nextId++, owner: p.owner, ring: k, angle: (a0 + Math.trunc((i * BRAD_FULL) / r.count)) % BRAD_FULL, touching: [], x: 0, y: 0, px: 0, py: 0 };
      place(b, p, r.orbit);
      b.px = b.x;
      b.py = b.y;
      s.beads.push(b);
    }
  });
}

/** Turns every bead one tick around its owner and hits the targets it newly touches. */
export function beadSystem(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) if (p.relicId === 'beads') lay(s, p, beadsRings(p));
  const r2 = BEADS.radius * BEADS.radius;
  for (const b of s.beads) {
    const p = s.players.find((q) => q.owner === b.owner) ?? s.players[0];
    const ring = beadsRings(p)[b.ring];
    // odd rings turn the other way
    const spin = Math.trunc(BRAD_FULL / ring.turn);
    b.angle = (b.angle + (b.ring % 2 ? BRAD_FULL - spin : spin)) % BRAD_FULL;
    b.px = b.x;
    b.py = b.y;
    place(b, p, ring.orbit);
    // a downed hero's beads turn without hitting
    if (p.dead) {
      b.touching.length = 0;
      continue;
    }
    // gathered first: a mob that goes down respawns elsewhere and leaves the bead
    const now: number[] = [];
    const fresh: number[] = [];
    for (let i = 0; i <= bossIndex(s); i++) {
      const t = targetAt(s, i);
      if (!t || dist2(t.x - b.x, t.y - b.y) >= r2) continue;
      now.push(i);
      if (!b.touching.includes(i)) fresh.push(i);
    }
    b.touching = now;
    for (const i of fresh) {
      damage(s, events, i, p, null, relicPct(p, ring.damage), false, b);
      // the target went down and came back elsewhere: it no longer touches this bead
      const t = targetAt(s, i);
      if (!t || dist2(t.x - b.x, t.y - b.y) >= r2) b.touching.splice(b.touching.indexOf(i), 1);
    }
  }
}
