import { STAFF } from '../content';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import { atan2B } from '../math/trig';
import type { Player, SimState } from '../state';
import { relicPct, staffLevel } from './build';
import { bossIndex, damage, kickTarget, targetAt } from './combat';

// The staff relic (docs/content.md "Relics"): instead of kicking a ball the hero sweeps the
// staff over the half circle toward his target and hits everything inside its reach at once,
// knocking the horde back (the elite and the boss stand, so the staff can keep hitting them).
// Awakened (Ruyi Staff) the sweep goes all the way round and reaches further.

/** How close a target has to be for the hero to start a swing. */
export function staffStart(p: Player): number {
  return Math.trunc((staffLevel(p).reach * STAFF.startPercent) / 100);
}

/** The staff lands: everything in the arc is hit once, the surviving horde pushed away. */
export function sweep(s: SimState, events: SimEvent[], p: Player): void {
  const lv = staffLevel(p);
  const full = p.awakened;
  const t = kickTarget(s, p, staffStart(p));
  let dx = p.facing;
  let dy = 0;
  if (t >= 0) {
    const b = targetAt(s, t)!;
    if (b.x !== p.x || b.y !== p.y) {
      dx = b.x - p.x;
      dy = b.y - p.y;
    }
  }
  events.push({ type: 'sweep', owner: p.owner, x: p.x, y: p.y, brad: atan2B(dy, dx), reach: lv.reach, full });
  // gathered first: a mob that goes down respawns elsewhere, and must not be hit twice
  const r2 = lv.reach * lv.reach;
  const hits: number[] = [];
  // charged once for the whole sweep (Stillness)
  const pct = relicPct(p, lv.damage);
  for (let i = 0; i <= bossIndex(s); i++) {
    const b = targetAt(s, i);
    if (!b) continue;
    const ox = b.x - p.x;
    const oy = b.y - p.y;
    if (dist2(ox, oy) > r2 || (!full && ox * dx + oy * dy < 0)) continue;
    hits.push(i);
  }
  for (const i of hits) {
    if (i < s.mobs.length) {
      const m = s.mobs[i];
      const d = dist(m.x - p.x, m.y - p.y) || 1;
      m.x += Math.trunc(((m.x - p.x) * lv.knockback) / d);
      m.y += Math.trunc(((m.y - p.y) * lv.knockback) / d);
    }
    damage(s, events, i, p, null, pct, false, p);
  }
}
