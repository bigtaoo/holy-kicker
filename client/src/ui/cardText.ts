import {
  PASSIVES, RELIC_LEVELS, SPELL_LEVELS, TICK_RATE, type Card, type CardKind, type PassiveId, type Player, type SpellId,
} from '@hk/engine';
import { t } from '../i18n';

// What a level-up card says (docs/content.md "International players"): the name, "New!" or
// the level step, and one short line per change with numbers, read from the engine's tables
// so the card never disagrees with the game. Pure, so it is tested without Pixi.

export interface CardText {
  kind: CardKind;
  name: string;
  /** "New!" or "Lv 2 → 3". */
  tag: string;
  fresh: boolean;
  lines: string[];
}

function seconds(ticks: number): string {
  return String(Math.round((ticks / TICK_RATE) * 10) / 10);
}

/** "+40" for 100 -> 140. */
function gain(a: number, b: number): number {
  return Math.round((b / a - 1) * 100);
}

function relicLines(level: number): string[] {
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

/** The text of `card` for player `p` (whose build says whether it is new or a level step). */
export function cardText(card: Card, p: Player): CardText {
  const levelTag = (level: number) => t('card.level', { a: level, b: level + 1 });
  if (card.kind === 'relic') {
    return { kind: 'relic', name: t('relic.ball.name'), tag: levelTag(p.relic), fresh: false, lines: relicLines(p.relic) };
  }
  if (card.kind === 'spell') {
    const id = card.id as SpellId;
    const slot = p.spells.find((s) => s.id === id);
    const name = t(`spell.${id}.name`);
    if (!slot) return { kind: 'spell', name, tag: t('card.new'), fresh: true, lines: [spellDesc(id)] };
    return { kind: 'spell', name, tag: levelTag(slot.level), fresh: false, lines: spellLines(id, slot.level) };
  }
  const id = card.id as PassiveId;
  const slot = p.passives.find((s) => s.id === id);
  return {
    kind: 'passive', name: t(`passive.${id}.name`), tag: slot ? levelTag(slot.level) : t('card.new'), fresh: !slot, lines: [passiveDesc(id)],
  };
}
