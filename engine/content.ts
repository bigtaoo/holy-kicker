import { perTick, ticks, toFp } from './math/fixed';

// The in-run build (docs/content.md "Build in a run"): the relic's levels, the spells and the
// passives a level-up card can offer, and the experience curve. Table rows are levels
// (index 0 is level 1). Percentages are whole numbers; times are ticks.

export const MAX_LEVEL = 5;
export const MAX_SPELLS = 4;
export const MAX_PASSIVES = 4;
export const OFFER_SIZE = 3;

/**
 * Experience from level L to L + 1: first + step * (L - 1) + square * (L - 1)^2. The square
 * keeps pace with the horde, which grows and dies faster as the build grows, for about 30
 * level-ups in a full chapter.
 */
export const LEVELING = { first: 5, step: 0, square: 1 };

export function xpToNext(level: number): number {
  const l = level - 1;
  return LEVELING.first + LEVELING.step * l + LEVELING.square * l * l;
}

/** The cuju ball (the starter relic): bounces per kick, damage percent, kick cooldown. */
export interface RelicLevel {
  hits: number;
  damage: number;
  cooldown: number;
}

export const RELIC_LEVELS: readonly RelicLevel[] = [
  { hits: 3, damage: 100, cooldown: ticks(0.9) },
  { hits: 4, damage: 100, cooldown: ticks(0.9) },
  { hits: 4, damage: 140, cooldown: ticks(0.9) },
  { hits: 4, damage: 140, cooldown: ticks(0.7) },
  { hits: 5, damage: 180, cooldown: ticks(0.7) },
];

export type SpellId = 'palm' | 'bolt' | 'incense' | 'bell' | 'cymbal';
export const SPELL_IDS: readonly SpellId[] = ['palm', 'bolt', 'incense', 'bell', 'cymbal'];

/**
 * One spell level. `count` is palms (palm), jumps (bolt) or cymbals (cymbal); `radius` the
 * blast, jump range, ring, bell blast or cymbal hit radius; `life` how long the incense ring
 * burns or a cymbal flies (0 for the others). The bell's cooldown is its recharge after it
 * breaks.
 */
export interface SpellLevel {
  cooldown: number;
  count: number;
  radius: number;
  life: number;
  damage: number;
}

function lv(cooldown: number, count: number, radius: number, life: number, damage: number): SpellLevel {
  return { cooldown: ticks(cooldown), count, radius: toFp(radius), life: ticks(life), damage };
}

export const SPELL_LEVELS: Readonly<Record<SpellId, readonly SpellLevel[]>> = {
  // a giant palm slams the densest group in reach (cast shape 'meteor')
  palm: [lv(3, 1, 240, 0, 100), lv(3, 2, 240, 0, 100), lv(2.5, 2, 280, 0, 100), lv(2.5, 3, 280, 0, 100), lv(2, 3, 320, 0, 150)],
  // lightning from the hero through `count` targets (cast shape 'chain')
  bolt: [lv(2.4, 5, 350, 0, 100), lv(2.4, 6, 350, 0, 100), lv(2, 7, 350, 0, 100), lv(2, 8, 350, 0, 130), lv(1.6, 10, 350, 0, 130)],
  // a burning ring left at the hero's feet (cast shape 'field')
  incense: [lv(4, 0, 300, 3, 100), lv(4, 0, 340, 3, 100), lv(3.4, 0, 340, 3.5, 100), lv(3.4, 0, 380, 3.5, 100), lv(2.8, 0, 380, 4, 150)],
  // a golden dome that takes one blow for the hero, then breaks in a blast (cast shape 'nova')
  bell: [lv(8, 0, 300, 0, 150), lv(7, 0, 320, 0, 150), lv(7, 0, 360, 0, 200), lv(6, 0, 360, 0, 200), lv(5, 0, 420, 0, 250)],
  // cymbals thrown out in a star, the first at the nearest enemy, piercing all they pass
  cymbal: [lv(2.4, 2, 70, 1.2, 100), lv(2.4, 3, 70, 1.2, 100), lv(2, 3, 85, 1.2, 100), lv(2, 4, 85, 1.2, 130), lv(1.6, 4, 100, 1.2, 130)],
};

export const SPELL_CAST = {
  /** The palm only looks for crowds this close to the hero. */
  palmReach: toFp(800),
  /** Mobs sampled as the centre of a palm; the one with most neighbours wins. */
  palmPicks: 8,
  fieldTick: ticks(0.5),
  /** A spell that found nothing to hit tries again after this long. */
  retry: ticks(0.3),
  /** A newly learned spell first casts after this long. */
  first: ticks(0.5),
  /** Spells deal this share of their damage to the elite and the boss (content.md roles). */
  bigPercent: 50,
  /** After the bell breaks the hero is untouchable this long (the blow it took). */
  bellGuard: ticks(0.5),
  /** Cymbals are only thrown with an enemy this close to aim at. */
  cymbalReach: toFp(1100),
  cymbalSpeed: perTick(1500),
};

export type Stat = 'cooldown' | 'maxHp' | 'speed' | 'area' | 'regen' | 'crit';
export type PassiveId = 'calm' | 'iron' | 'legs' | 'eye' | 'rice' | 'wrath';
export const PASSIVE_IDS: readonly PassiveId[] = ['calm', 'iron', 'legs', 'eye', 'rice', 'wrath'];

/**
 * Each passive adds `perLevel` to one stat per level. Units: percent, except `regen`
 * (per mille of max health per second).
 */
export const PASSIVES: Readonly<Record<PassiveId, { stat: Stat; perLevel: number }>> = {
  calm: { stat: 'cooldown', perLevel: 8 },
  iron: { stat: 'maxHp', perLevel: 15 },
  legs: { stat: 'speed', perLevel: 8 },
  eye: { stat: 'area', perLevel: 10 },
  rice: { stat: 'regen', perLevel: 4 },
  wrath: { stat: 'crit', perLevel: 5 },
};

export type CardKind = 'relic' | 'spell' | 'passive';

/** A level-up card: the relic ('ball'), a spell or a passive, new or one level up. */
export interface Card {
  kind: CardKind;
  id: string;
}
