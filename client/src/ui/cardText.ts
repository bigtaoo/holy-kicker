import {
  EVOLVE, MAX_LEVEL, PASSIVES, RELIC_IDS, RELIC_LEVELS, SHRINE, SPELL_CAST, SPELL_EVOLVED, SPELL_LEVELS, STAFF_AWAKENED, STAFF_LEVELS, TICK_RATE,
  type Card, type CardKind, type PassiveId, type Player, type RelicId, type SpellId,
} from '@hk/engine';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { pairsOf, type IconId } from './buildSlots';

// What a level-up card says (docs/content.md "International players"): the name, "New!" or
// the level step, and one short line per change with numbers, read from the engine's tables
// so the card never disagrees with the game. Pure, so it is tested without Pixi.

export interface CardText {
  kind: CardKind;
  name: string;
  /** "New!", "Lv 2 → 3" or "Evolve!". */
  tag: string;
  fresh: boolean;
  lines: string[];
  /** The item's icon; null for shrine blessings. */
  icon: IconId | null;
  /** What the item evolves with (shown small on the icon), see pairsOf. */
  pairs: IconId[];
}

function seconds(ticks: number): string {
  return String(Math.round((ticks / TICK_RATE) * 10) / 10);
}

/** "+40" for 100 -> 140. */
function gain(a: number, b: number): number {
  return Math.round((b / a - 1) * 100);
}

function staffLines(level: number): string[] {
  const a = STAFF_LEVELS[level - 1];
  const b = STAFF_LEVELS[level];
  const lines: string[] = [];
  if (b.reach !== a.reach) lines.push(t('card.reach', { n: gain(a.reach, b.reach) }));
  if (b.damage !== a.damage) lines.push(t('card.damage', { n: gain(a.damage, b.damage) }));
  if (b.cooldown !== a.cooldown) lines.push(t('card.cooldown', { a: seconds(a.cooldown), b: seconds(b.cooldown) }));
  return lines;
}

function relicLines(id: RelicId, level: number): string[] {
  if (id === 'staff') return staffLines(level);
  const a = RELIC_LEVELS[level - 1];
  const b = RELIC_LEVELS[level];
  const lines: string[] = [];
  if (b.hits !== a.hits) lines.push(t('card.bounces', { a: a.hits, b: b.hits }));
  if (b.damage !== a.damage) lines.push(t('card.damage', { n: gain(a.damage, b.damage) }));
  if (b.cooldown !== a.cooldown) lines.push(t('card.cooldown', { a: seconds(a.cooldown), b: seconds(b.cooldown) }));
  return lines;
}

function spellDesc(id: SpellId): string {
  const l = SPELL_LEVELS[id][0];
  if (id === 'palm') return t('spell.palm.desc');
  if (id === 'bolt' || id === 'cymbal') return t(`spell.${id}.desc`, { n: l.count });
  if (id === 'bell') return t('spell.bell.desc', { s: seconds(l.cooldown) });
  return t('spell.incense.desc', { s: seconds(l.life) });
}

function spellLines(id: SpellId, level: number): string[] {
  const a = SPELL_LEVELS[id][level - 1];
  const b = SPELL_LEVELS[id][level];
  const lines: string[] = [];
  // only the palm, bolt and cymbals have a count
  if (b.count !== a.count) lines.push(t(`spell.${id as 'palm' | 'bolt' | 'cymbal'}.count`, { a: a.count, b: b.count }));
  if (b.radius !== a.radius) lines.push(t('card.area', { n: gain(a.radius, b.radius) }));
  if (b.life !== a.life) lines.push(t('card.duration', { a: seconds(a.life), b: seconds(b.life) }));
  if (b.damage !== a.damage) lines.push(t('card.damage', { n: gain(a.damage, b.damage) }));
  if (b.cooldown !== a.cooldown) lines.push(t('card.cooldown', { a: seconds(a.cooldown), b: seconds(b.cooldown) }));
  return lines;
}

function passiveDesc(id: PassiveId): string {
  const n = PASSIVES[id].perLevel;
  // regen is per mille of max health per second
  return t(`passive.${id}.desc`, { n: id === 'rice' ? n / 10 : n });
}

function isRelic(id: string): id is RelicId {
  return RELIC_IDS.includes(id as RelicId);
}

function evolveDesc(id: SpellId | RelicId): string {
  if (id === 'ball') return t('evolve.ball.desc', { n: EVOLVE.splinters + 1 });
  if (id === 'staff') return t('evolve.staff.desc');
  if (id === 'palm') return t('evolve.palm.desc', { s: seconds(SPELL_EVOLVED.palm.life) });
  if (id === 'incense') {
    // per mille of max health per field tick, as percent per second
    return t('evolve.incense.desc', { n: Math.round((EVOLVE.incenseHeal * TICK_RATE) / SPELL_CAST.fieldTick) / 10 });
  }
  if (id === 'bell') return t('evolve.bell.desc', { s: seconds(EVOLVE.bellGuard) });
  if (id === 'cymbal') return t('evolve.cymbal.desc', { n: SPELL_EVOLVED.cymbal.count });
  return t('evolve.bolt.desc');
}

/** An evolution card: what changes, then the area or damage gained over level 5. */
function evolveText(id: SpellId | RelicId): CardText {
  const lines = [evolveDesc(id)];
  if (id === 'staff') lines.push(t('card.reach', { n: gain(STAFF_LEVELS[MAX_LEVEL - 1].reach, STAFF_AWAKENED.reach) }));
  else if (!isRelic(id) && id !== 'cymbal') {
    const a = SPELL_LEVELS[id][MAX_LEVEL - 1];
    const b = SPELL_EVOLVED[id];
    if (b.radius !== a.radius) lines.push(t('card.area', { n: gain(a.radius, b.radius) }));
    if (b.damage !== a.damage) lines.push(t('card.damage', { n: gain(a.damage, b.damage) }));
  }
  const tag = isRelic(id) ? t('card.awaken') : t('card.evolve');
  return { kind: 'evolve', name: t(`evolve.${id}.name`), tag, fresh: true, lines, icon: id, pairs: [] };
}

/** The text of `card` for player `p` (whose build says whether it is new or a level step). */
export function cardText(card: Card, p: Player): CardText {
  if (card.kind === 'shrine') return shrineText(card.id);
  if (card.kind === 'evolve') return evolveText(card.id as SpellId | RelicId);
  const levelTag = (level: number) => t('card.level', { a: level, b: level + 1 });
  const item = { icon: card.id as IconId, pairs: pairsOf(p, card.id as IconId) };
  if (card.kind === 'relic') {
    const id = card.id as RelicId;
    return { kind: 'relic', name: t(`relic.${id}.name`), tag: levelTag(p.relic), fresh: false, lines: relicLines(id, p.relic), ...item };
  }
  if (card.kind === 'spell') {
    const id = card.id as SpellId;
    const slot = p.spells.find((s) => s.id === id);
    const name = t(`spell.${id}.name`);
    if (!slot) return { kind: 'spell', name, tag: t('card.new'), fresh: true, lines: [spellDesc(id)], ...item };
    return { kind: 'spell', name, tag: levelTag(slot.level), fresh: false, lines: spellLines(id, slot.level), ...item };
  }
  const id = card.id as PassiveId;
  const slot = p.passives.find((s) => s.id === id);
  return {
    kind: 'passive', name: t(`passive.${id}.name`), tag: slot ? levelTag(slot.level) : t('card.new'), fresh: !slot, lines: [passiveDesc(id)], ...item,
  };
}

function shrineText(id: string): CardText {
  const name = t(`shrine.${id as 'heal' | 'insight' | 'offering'}.name`);
  const lines =
    id === 'heal' ? [t('shrine.heal.desc', { n: SHRINE.healPercent })]
    : id === 'insight' ? [t('shrine.insight.desc')]
    : [t('shrine.offering.desc'), t('shrine.offering.more', { n: BALANCE.offeringPercent })];
  return { kind: 'shrine', name, tag: '', fresh: false, lines, icon: null, pairs: [] };
}
