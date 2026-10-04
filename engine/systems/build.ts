import { DROPS, HERO, SHRINE } from '../config';
import {
  BEADS_AWAKENED, BEADS_LEVELS, BOWL_AWAKENED, BOWL_LEVELS, EVOLVE_PAIR, FISH_AWAKENED, FISH_LEVELS, MAX_LEVEL, RELIC_AWAKENED, RELIC_IDS, SPELL_EVOLVED, STAFF_AWAKENED, STAFF_LEVELS, MAX_PASSIVES, MAX_SPELLS, OFFER_SIZE, PASSIVE_IDS, PASSIVES, RELIC_LEVELS, SHRINE_IDS, SPELL_CAST, SPELL_IDS, SPELL_LEVELS, SUTRA_IDS,
  xpToNext, type BeadsRing, type Card, type PassiveId, type RelicId, type SpellId, type SpellLevel, type Stat, type SutraId,
} from '../content';
import type { SimEvent } from '../events';
import { TICK_RATE } from '../math/fixed';
import type { Player, SimState, SpellSlot } from '../state';

// The hero's build in a run (docs/content.md "Build in a run"). Experience fills levels; each
// level-up deals OFFER_SIZE cards from what can still grow (the relic, owned spells and
// passives below max level, new ones while a slot is free) and the sim stands still until
// the player picks one. An evolution that is ready (docs/content.md) is always dealt first,
// so the player sees it on the very next level-up. Passives are a modifier stack: a stat is the sum of its passives'
// levels times their per-level value, read where it applies. Only chapters level up; the
// sandbox just counts experience.

/** Regen is counted in 1 / REGEN_UNIT health points. */
const REGEN_UNIT = 1000 * TICK_RATE;

export function stat(p: Player, which: Stat): number {
  let v = p.bonus[which] ?? 0;
  for (const slot of p.passives) {
    const def = PASSIVES[slot.id];
    if (def.stat === which) v += def.perLevel * slot.level;
    if (def.also?.stat === which) v += def.also.perLevel * slot.level;
  }
  return v;
}

/** Experience for the player, grown by the xp stat; the fraction left over carries to the next gain. */
export function gainXp(p: Player, value: number): void {
  p.xpPart += value * (100 + stat(p, 'xp'));
  const whole = Math.trunc(p.xpPart / 100);
  p.xpPart -= whole * 100;
  p.xp += whole;
}

/** The radius in which resting gems fly to the player. */
export function magnetOf(p: Player): number {
  return Math.trunc((DROPS.magnet * (100 + stat(p, 'magnet'))) / 100);
}

/** A spell's lifetime grown by the duration stat. */
export function lasting(p: Player, life: number): number {
  return Math.trunc((life * (100 + stat(p, 'duration'))) / 100);
}

/** Max health with the stat stack applied. */
export function maxHpOf(p: Player): number {
  return Math.trunc((HERO.hp * (100 + stat(p, 'maxHp'))) / 100);
}

/** The cuju's numbers at the player's relic level (also read for a staff's level-ups). */
export function relicLevel(p: Player) {
  return p.awakened ? RELIC_AWAKENED : RELIC_LEVELS[p.relic - 1];
}

export function staffLevel(p: Player) {
  return p.awakened ? STAFF_AWAKENED : STAFF_LEVELS[p.relic - 1];
}

export function fishLevel(p: Player) {
  return p.awakened ? FISH_AWAKENED : FISH_LEVELS[p.relic - 1];
}

/** The prayer beads' rings: one per level row, two awakened. */
export function beadsRings(p: Player): readonly BeadsRing[] {
  return p.awakened ? BEADS_AWAKENED : [BEADS_LEVELS[p.relic - 1]];
}

export function bowlLevel(p: Player) {
  return p.awakened ? BOWL_AWAKENED : BOWL_LEVELS[p.relic - 1];
}

/** Ticks between two attacks of the player's relic (the beads never stop, so never asked). */
export function relicCooldown(p: Player): number {
  if (p.relicId === 'staff') return staffLevel(p).cooldown;
  if (p.relicId === 'fish') return fishLevel(p).cooldown;
  if (p.relicId === 'bowl') return bowlLevel(p).cooldown;
  return relicLevel(p).cooldown;
}

/** The numbers a spell slot casts with: its level's row, or the evolved one. */
export function slotStats(slot: SpellSlot): SpellLevel {
  return slot.evolved ? SPELL_EVOLVED[slot.id] : spellLevel(slot.id, slot.level);
}

function hasPassive(p: Player, id: PassiveId): boolean {
  return p.passives.some((ps) => ps.id === id);
}

/** Evolutions (and the awakening) that are ready: maxed, paired passive owned, not yet taken. */
export function evolutions(p: Player): Card[] {
  const ready: Card[] = [];
  if (p.relic === MAX_LEVEL && !p.awakened && hasPassive(p, EVOLVE_PAIR[p.relicId])) ready.push({ kind: 'evolve', id: p.relicId });
  for (const sp of p.spells) {
    if (sp.level === MAX_LEVEL && !sp.evolved && hasPassive(p, EVOLVE_PAIR[sp.id])) ready.push({ kind: 'evolve', id: sp.id });
  }
  return ready;
}

/** Spells and passives behind a sutra stay out of the pool until the run has it. */
function offered(id: string, sutras: readonly SutraId[]): boolean {
  return !SUTRA_IDS.includes(id as SutraId) || sutras.includes(id as SutraId);
}

/** The cards that can still be picked, in a fixed order (the deal draws from it). */
export function cardPool(p: Player, sutras: readonly SutraId[] = []): Card[] {
  const pool: Card[] = [];
  if (p.relic < MAX_LEVEL) pool.push({ kind: 'relic', id: p.relicId });
  for (const sp of p.spells) if (sp.level < MAX_LEVEL) pool.push({ kind: 'spell', id: sp.id });
  if (p.spells.length < MAX_SPELLS) {
    for (const id of SPELL_IDS) if (offered(id, sutras) && !p.spells.some((sp) => sp.id === id)) pool.push({ kind: 'spell', id });
  }
  for (const ps of p.passives) if (ps.level < MAX_LEVEL) pool.push({ kind: 'passive', id: ps.id });
  if (p.passives.length < MAX_PASSIVES) {
    for (const id of PASSIVE_IDS) if (offered(id, sutras) && !p.passives.some((ps) => ps.id === id)) pool.push({ kind: 'passive', id });
  }
  return pool;
}

/** Ready evolutions first, then distinct cards from the pool (a partial shuffle), OFFER_SIZE in all. */
function deal(s: SimState, p: Player): Card[] {
  const first = evolutions(p).slice(0, OFFER_SIZE);
  const pool = cardPool(p, s.config.sutras);
  const n = Math.min(OFFER_SIZE - first.length, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + s.cards.int(pool.length - i);
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return first.concat(pool.slice(0, n));
}

/** Levels up while the experience allows and no offer is open; one offer at a time. */
function levelUp(s: SimState, events: SimEvent[], p: Player): void {
  while (p.offer.length === 0 && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    p.offer = deal(s, p);
    events.push({ type: 'levelUp', owner: p.owner, level: p.level });
  }
}

/** Takes card `index` of the open offer; anything else is ignored. */
export function pickCard(s: SimState, events: SimEvent[], p: Player, index: number): void {
  const card = p.offer[index];
  if (!card) return;
  p.offer = [];
  if (card.kind === 'shrine') shrineCard(s, p, card.id);
  else if (card.kind === 'relic') p.relic++;
  else if (card.kind === 'evolve') evolve(p, card.id);
  else if (card.kind === 'spell') {
    const slot = p.spells.find((sp) => sp.id === card.id);
    if (slot) slot.level++;
    else p.spells.push({ id: card.id as SpellId, level: 1, cd: SPELL_CAST.first, evolved: false });
  } else {
    const slot = p.passives.find((ps) => ps.id === card.id);
    if (slot) slot.level++;
    else p.passives.push({ id: card.id as PassiveId, level: 1 });
    // more max health comes filled
    const max = maxHpOf(p);
    p.hp += max - p.maxHp;
    p.maxHp = max;
  }
  events.push({ type: 'pick', owner: p.owner, kind: card.kind, id: card.id });
  levelUp(s, events, p);
}

function evolve(p: Player, id: string): void {
  if (RELIC_IDS.includes(id as RelicId)) {
    p.awakened = true;
    return;
  }
  const slot = p.spells.find((sp) => sp.id === id);
  if (!slot) return;
  slot.evolved = true;
  // the evolved form casts soon, so the pick shows at once
  slot.cd = Math.min(slot.cd, SPELL_CAST.first);
}

/**
 * A shrine: each hero who is up gets its paid offering counted and the three shrine cards;
 * the sim stands still until they pick, like a level-up.
 */
export function openShrine(s: SimState): void {
  for (const p of s.players) {
    if (p.dead) continue;
    payBet(p);
    p.offer = SHRINE_IDS.map((id): Card => ({ kind: 'shrine', id }));
  }
}

/** An offering that stands is won by a hero who is up at the next shrine or the win. */
export function payBet(p: Player): void {
  if (!p.bet || p.dead) return;
  p.bet = false;
  p.offerings++;
}

function shrineCard(s: SimState, p: Player, id: string): void {
  if (id === 'heal') p.hp = Math.min(p.maxHp, p.hp + Math.trunc((p.maxHp * SHRINE.healPercent) / 100));
  else if (id === 'insight') p.offer = deal(s, p);
  else p.bet = true;
}

/** Regeneration and level-ups, after the tick's pickups. */
export function buildSystem(s: SimState, events: SimEvent[]): void {
  if (s.config.waves === 0) return;
  for (const p of s.players) {
    if (p.dead) continue;
    const regen = stat(p, 'regen');
    if (regen > 0 && p.hp < p.maxHp) {
      p.regen += p.maxHp * regen;
      const gained = Math.trunc(p.regen / REGEN_UNIT);
      p.regen -= gained * REGEN_UNIT;
      p.hp = Math.min(p.maxHp, p.hp + gained);
    }
    levelUp(s, events, p);
  }
}

/** True while some player still has to pick a card. */
export function choosing(s: SimState): boolean {
  return s.players.some((p) => p.offer.length > 0);
}

export function spellLevel(id: SpellId, level: number) {
  return SPELL_LEVELS[id][level - 1];
}
