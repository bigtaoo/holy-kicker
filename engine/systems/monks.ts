import { HERO, MONK_PASSIVE as MONK } from '../config';
import { MONK_STATS, SPELL_CAST, STATS, type MonkId, type StatBonus } from '../content';
import type { SimEvent } from '../events';
import { dist, dist2 } from '../math/fixed';
import type { Player, SimState } from '../state';
import { bossIndex, damage, targetAt } from './combat';

// The monks (docs/content.md "Monks"): their stats join the gear's at the bottom of the stat
// stack; the fat monk's belly bounces the enemies around him back whenever a blow lands, and
// the novice dodges every few blows while he runs.

/** The stats a run brings in: the gear's and training's (`bonus`) and the monk's added up. */
export function monkBonus(bonus: StatBonus, monk: MonkId): StatBonus {
  const own = MONK_STATS[monk];
  const out: Partial<Record<(typeof STATS)[number], number>> = {};
  for (const k of STATS) {
    const v = (bonus[k] ?? 0) + (own[k] ?? 0);
    if (v !== 0) out[k] = v;
  }
  return out;
}

/** Light Feet: the running novice lets every MONK.dodgeEvery-th blow pass (and is untouchable for the hurt cooldown, as after a blow). */
export function dodged(events: SimEvent[], p: Player): boolean {
  if (p.monk !== 'novice' || !p.moving) return false;
  p.dodge++;
  if (p.dodge % MONK.dodgeEvery !== 0) return false;
  p.hurtCd = HERO.hurtCooldown;
  events.push({ type: 'dodge', owner: p.owner });
  return true;
}

/** Belly Bounce: a blow on the fat monk hits everything within MONK.radius and throws the horde back. */
export function bellyBounce(s: SimState, events: SimEvent[], p: Player): void {
  if (p.monk !== 'fat') return;
  const r2 = MONK.radius * MONK.radius;
  const hits: number[] = [];
  for (let i = 0; i <= bossIndex(s); i++) {
    const t = targetAt(s, i);
    if (t && dist2(t.x - p.x, t.y - p.y) <= r2) hits.push(i);
  }
  events.push({ type: 'bounce', owner: p.owner, x: p.x, y: p.y, radius: MONK.radius });
  for (const i of hits) {
    const t = targetAt(s, i);
    if (!t) continue;
    const x0 = t.x;
    const y0 = t.y;
    const big = i >= s.mobs.length;
    damage(s, events, i, p, null, big ? Math.trunc((MONK.damage * SPELL_CAST.bigPercent) / 100) : MONK.damage);
    // a mob still standing where it was is thrown back; one that fell respawned elsewhere
    if (big) continue;
    const m = s.mobs[i];
    if (m.x !== x0 || m.y !== y0) continue;
    const d = dist(m.x - p.x, m.y - p.y) || 1;
    m.x += Math.trunc(((m.x - p.x) * MONK.knockback) / d);
    m.y += Math.trunc(((m.y - p.y) * MONK.knockback) / d);
  }
}
