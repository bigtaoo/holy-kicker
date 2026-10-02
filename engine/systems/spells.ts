import { SPELLS } from '../config';
import { EVOLVE, SPELL_CAST } from '../content';
import type { SimEvent } from '../events';
import { dist2, TICK_RATE, toFp } from '../math/fixed';
import type { Player, SimState, SpellSlot } from '../state';
import { slotStats, stat } from './build';
import { bossIndex, damage, eliteIndex, targetAt } from './combat';
import { cymbalSystem, spinWheel, throwCymbals } from './cymbals';

// Area spells. Each player casts the spells of their build on their own cooldowns (shrunk by
// the cooldown stat, grown by the area stat); the sandbox can also cast the stress-test spells
// round-robin around the first player at the run's rate. Spells kill the mobs they reach and
// deal SPELL_CAST.bigPercent of their damage to the elite and the boss. The Golden Bell is a
// shield rather than a cast: its cooldown raises it, and it only recharges once a blow breaks
// it (breakBell, from hurtPlayer). Evolved spells (docs/content.md) cast from their own row:
// the Mountain Palm leaves a print that pins mobs, the Endless Chain forks at every jump,
// Healing Incense heals the hero standing in it, the Golden Body guards longer after it breaks
// and the Cymbal Wheel keeps its cymbals circling the hero.

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

interface FieldMods {
  pin?: boolean;
  heal?: number;
}

function placeField(
  s: SimState, events: SimEvent[], p: Player, x: number, y: number, radius: number, life: number, damagePct: number, mods: FieldMods = {},
): void {
  const pin = mods.pin ?? false;
  s.fields.push({ id: s.nextId++, owner: p.owner, x, y, radius, life, damage: damagePct, age: 0, next: 0, pin, heal: mods.heal ?? 0 });
  // the pinning print starts burning on its next field tick, after the palm's own blast
  if (pin) s.fields[s.fields.length - 1].next = SPELL_CAST.fieldTick;
  else events.push({ type: 'cast', kind: 'field', x, y, radius });
}

/** The nearest target within range of (x, y) not in `hit`; -1 if none. */
function nearestNew(s: SimState, x: number, y: number, range: number, hit: readonly number[]): number {
  let best = -1;
  let bestD = range * range;
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
  return best;
}

/**
 * Lightning from the player's chest jumping from target to target, never one twice. With
 * `fork` every jump also strikes the nearest other target from where it landed.
 */
function chain(s: SimState, events: SimEvent[], p: Player, jumps: number, range: number, damagePct: number, fork = false): boolean {
  let x = p.x;
  let y = p.y - CHEST;
  const hit: number[] = [];
  for (let j = 0; j < jumps; j++) {
    const best = nearestNew(s, x, y, j === 0 ? range * 2 : range, hit);
    if (best < 0) break;
    hit.push(best);
    const t = targetAt(s, best)!;
    const tx = t.x;
    const ty = t.y - BODY;
    events.push({ type: 'bolt', x0: x, y0: y, x1: tx, y1: ty });
    damage(s, events, best, p, null, pct(s, best, damagePct));
    x = tx;
    y = ty;
    const side = fork ? nearestNew(s, x, y, Math.trunc((range * EVOLVE.forkRangePercent) / 100), hit) : -1;
    if (side >= 0) {
      hit.push(side);
      const f = targetAt(s, side)!;
      events.push({ type: 'bolt', x0: x, y0: y, x1: f.x, y1: f.y - BODY });
      damage(s, events, side, p, null, pct(s, side, damagePct));
    }
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

/** A spell radius grown by the area stat. */
function scaled(p: Player, radius: number): number {
  return Math.trunc((radius * (100 + stat(p, 'area'))) / 100);
}

/**
 * The bell takes the blow instead of p: it breaks in a blast around the hero, who stays
 * untouchable for a moment. False when p has no bell up.
 */
export function breakBell(s: SimState, events: SimEvent[], p: Player): boolean {
  const slot = p.spells.find((sp) => sp.id === 'bell');
  if (!p.bell || !slot) return false;
  p.bell = false;
  p.hurtCd = slot.evolved ? EVOLVE.bellGuard : SPELL_CAST.bellGuard;
  const l = slotStats(slot);
  const r = scaled(p, l.radius);
  events.push({ type: 'bellBreak', owner: p.owner });
  events.push({ type: 'cast', kind: 'nova', x: p.x, y: p.y, radius: r });
  area(s, events, p, p.x, p.y, r, l.damage);
  return true;
}

/** Casts the spell in `slot` for p; false when it found nothing to hit. */
function cast(s: SimState, events: SimEvent[], p: Player, slot: SpellSlot): boolean {
  const id = slot.id;
  const l = slotStats(slot);
  const r = scaled(p, l.radius);
  if (id === 'palm') {
    let any = false;
    for (let i = 0; i < l.count; i++) {
      const at = crowd(s, p, r);
      if (!at) break;
      blast(s, events, p, at[0], at[1], r, l.damage);
      if (slot.evolved) placeField(s, events, p, at[0], at[1], r, l.life, Math.trunc((l.damage * EVOLVE.palmBurnPercent) / 100), { pin: true });
      any = true;
    }
    return any;
  }
  if (id === 'bolt') return chain(s, events, p, l.count, r, l.damage, slot.evolved);
  if (id === 'cymbal') return slot.evolved ? spinWheel(s, p, l.count, r, l.damage) : throwCymbals(s, p, l.count, r, l.life, l.damage);
  if (id === 'bell') {
    p.bell = true;
    events.push({ type: 'bellUp', owner: p.owner });
    return true;
  }
  placeField(s, events, p, p.x, p.y, r, l.life, l.damage, { heal: slot.evolved ? EVOLVE.incenseHeal : 0 });
  return true;
}

/** The players' own spells, each on its cooldown. */
function buildSpells(s: SimState, events: SimEvent[]): void {
  for (const p of s.players) {
    if (p.dead) continue;
    const faster = 100 - stat(p, 'cooldown');
    for (const sp of p.spells) {
      // a bell that is up waits for its blow
      if ((sp.id === 'bell' && p.bell) || --sp.cd > 0) continue;
      sp.cd = cast(s, events, p, sp)
        ? Math.max(1, Math.trunc((slotStats(sp).cooldown * faster) / 100))
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
      if (f.heal > 0 && !by.dead && dist2(by.x - f.x, by.y - f.y) < f.radius * f.radius) {
        by.hp = Math.min(by.maxHp, by.hp + Math.max(1, Math.trunc((by.maxHp * f.heal) / 1000)));
      }
    }
    if (f.age < f.life) s.fields[w++] = f;
  }
  s.fields.length = w;
  cymbalSystem(s, events);
}
