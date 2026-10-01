import { SPELLS } from '../config';
import { SPELL_CAST, type SpellId } from '../content';
import type { SimEvent } from '../events';
import { dist2, TICK_RATE, toFp } from '../math/fixed';
import type { Player, SimState } from '../state';
import { spellLevel, stat } from './build';
import { bossIndex, damage, eliteIndex, targetAt } from './combat';

// Area spells. Each player casts the spells of their build on their own cooldowns (shrunk by
// the cooldown stat, grown by the area stat); the sandbox can also cast the stress-test spells
// round-robin around the first player at the run's rate. Spells kill the mobs they reach and
// deal SPELL_CAST.bigPercent of their damage to the elite and the boss.

/** Bolts leave the caster's chest and land on the target's body. */
const CHEST = toFp(60);
const BODY = toFp(50);

/** Damage percent of a spell hit on target i. */
function pct(s: SimState, i: number, damagePct: number): number {
  return i < s.mobs.length ? damagePct : Math.trunc((damagePct * SPELL_CAST.bigPercent) / 100);
}

/** Damages every target within r of (x, y). */
function area(s: SimState, events: SimEvent[], by: Player, x: number, y: number, r: number, damagePct: number): void {
  const r2 = r * r;
  const n = bossIndex(s);
  for (let i = 0; i <= n; i++) {
    const t = targetAt(s, i);
    if (t && dist2(t.x - x, t.y - y) < r2) damage(s, events, i, by, null, pct(s, i, damagePct));
  }
}

function near(s: SimState, p: Player, spread: number): [number, number] {
  return [p.x + s.spell.range(-spread, spread), p.y + s.spell.range(-spread, spread)];
}

function blast(s: SimState, events: SimEvent[], p: Player, x: number, y: number, r: number, damagePct: number): void {
  events.push({ type: 'cast', kind: 'meteor', x, y, radius: r });
  area(s, events, p, x, y, r, damagePct);
}

function placeField(s: SimState, events: SimEvent[], p: Player, x: number, y: number, radius: number, life: number, damagePct: number): void {
  s.fields.push({ id: s.nextId++, owner: p.owner, x, y, radius, life, damage: damagePct, age: 0, next: 0 });
  events.push({ type: 'cast', kind: 'field', x, y, radius });
}

/** Lightning from the player's chest jumping from target to target, never one twice. */
function chain(s: SimState, events: SimEvent[], p: Player, jumps: number, range: number, damagePct: number): boolean {
  let x = p.x;
  let y = p.y - CHEST;
  const hit: number[] = [];
  for (let j = 0; j < jumps; j++) {
    const reach = j === 0 ? range * 2 : range;
    let best = -1;
    let bestD = reach * reach;
    const n = bossIndex(s);
    for (let i = 0; i <= n; i++) {
      const t = hit.includes(i) ? null : targetAt(s, i);
      if (!t) continue;
      const d = dist2(t.x - x, t.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    hit.push(best);
    const t = targetAt(s, best)!;
    const tx = t.x;
    const ty = t.y - BODY;
    events.push({ type: 'bolt', x0: x, y0: y, x1: tx, y1: ty });
    damage(s, events, best, p, null, pct(s, best, damagePct));
    x = tx;
    y = ty;
  }
  return hit.length > 0;
}

/**
 * The centre for a palm: of a few mobs sampled within reach, the one with most mobs inside
 * the blast; the elite or boss when no mob is near. Null when nothing is in reach.
 */
function crowd(s: SimState, p: Player, r: number): [number, number] | null {
  const reach2 = SPELL_CAST.palmReach * SPELL_CAST.palmReach;
  const r2 = r * r;
  let best: [number, number] | null = null;
  let bestN = 0;
  for (let k = 0; k < SPELL_CAST.palmPicks && s.mobs.length > 0; k++) {
    const m = s.mobs[s.spell.int(s.mobs.length)];
    if (dist2(m.x - p.x, m.y - p.y) >= reach2) continue;
    let n = 0;
    for (const o of s.mobs) if (dist2(o.x - m.x, o.y - m.y) < r2) n++;
    if (n > bestN) {
      bestN = n;
      best = [m.x, m.y];
    }
  }
  if (best) return best;
  for (const i of [eliteIndex(s), bossIndex(s)]) {
    const t = targetAt(s, i);
    if (t && dist2(t.x - p.x, t.y - p.y) < reach2) return [t.x, t.y];
  }
  return null;
}

/** Casts spell `id` at `level` for p; false when it found nothing to hit. */
function cast(s: SimState, events: SimEvent[], p: Player, id: SpellId, level: number): boolean {
  const l = spellLevel(id, level);
  const r = Math.trunc((l.radius * (100 + stat(p, 'area'))) / 100);
  if (id === 'palm') {
    let any = false;
    for (let i = 0; i < l.count; i++) {
      const at = crowd(s, p, r);
      if (!at) break;
      blast(s, events, p, at[0], at[1], r, l.damage);
      any = true;
    }
    return any;
  }
  if (id === 'bolt') return chain(s, events, p, l.count, r, l.damage);
  placeField(s, events, p, p.x, p.y, r, l.life, l.damage);
  return true;
}

/** The players' own spells, each on its cooldown. */
function buildSpells(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) {
    if (p.dead) continue;
    const faster = 100 - stat(p, 'cooldown');
    for (const sp of p.spells) {
      if (--sp.cd > 0) continue;
      sp.cd = cast(s, events, p, sp.id, sp.level)
        ? Math.max(1, Math.trunc((spellLevel(sp.id, sp.level).cooldown * faster) / 100))
        : SPELL_CAST.retry;
    }
  }
}

/** The sandbox's stress-test casts, round-robin around the first player. */
function stressSpells(s: SimState, events: SimEvent[]): void {
  const c = s.config;
  const p = s.players[0];
  if (c.spells.length === 0 || --s.spellT > 0) return;
  s.spellT = Math.max(1, Math.round(TICK_RATE / c.spellRate));
  const kind = c.spells[s.spellNext++ % c.spells.length];
  if (kind === 'nova') {
    events.push({ type: 'cast', kind, x: p.x, y: p.y, radius: SPELLS.novaRadius });
    area(s, events, p, p.x, p.y, SPELLS.novaRadius, 100);
  } else if (kind === 'meteor') {
    for (let i = 0; i < SPELLS.meteors; i++) {
      const [x, y] = near(s, p, SPELLS.meteorSpread);
      blast(s, events, p, x, y, SPELLS.meteorRadius, 100);
    }
  } else if (kind === 'field') {
    const [x, y] = near(s, p, SPELLS.fieldSpread);
    placeField(s, events, p, x, y, SPELLS.fieldRadius, SPELLS.fieldLife, 100);
  } else {
    chain(s, events, p, SPELLS.chainJumps, SPELLS.chainRange, 100);
  }
}

export function spellSystem(s: SimState, events: SimEvent[]): void {
  stressSpells(s, events);
  buildSpells(s, events);
  let w = 0;
  for (const f of s.fields) {
    f.age++;
    if (--f.next <= 0) {
      f.next = SPELL_CAST.fieldTick;
      const by = s.players.find((q) => q.owner === f.owner) ?? s.players[0];
      area(s, events, by, f.x, f.y, f.radius, f.damage);
    }
    if (f.age < f.life) s.fields[w++] = f;
  }
  s.fields.length = w;
}
