import { ticks, toFp } from './math/fixed';
import { actOf } from './chapters';

// The acts' rules (docs/design.md "Acts"): every round of the maps is an act, and each act from
// the second adds a rule to the earlier acts' ones. Act 2 (chapters 6–10) is played at night (the
// client's alone), its horde takes in the next map's newcomers and its map's elite comes as a pair;
// act 3 (11–15) gives the elites and bosses affixes; act 4 (16–20) ends on a boss rush. Hard mode
// plays the same rules. Re-exported by config.ts.

export const ACTS = {
  /** The act from which the next map's newcomers join, mixDelay waves after their own map's start. */
  mix: 2,
  mixDelay: 10,
  /** The act from which the map's elite comes as a pair. */
  pairs: 2,
  /** The act from which elites carry eliteAffixes affixes and bosses (mid-bosses too) bossAffixes. */
  affixes: 3,
  eliteAffixes: 1,
  bossAffixes: 2,
  /**
   * The act from which the last wave is a boss rush: the next map's boss (the abbot for the Inner
   * Demon's) and then the map's own; the last chapter has every boss, the Inner Demon last. The ones
   * before the last have rushLeadPercent of their health; each comes rushAfter the one before fell.
   */
  rush: 4,
  rushLeadPercent: 50,
  rushAfter: ticks(1.5),
};

/** Whether chapter `chapter` plays the rule of act `act` (an ACTS field). */
export function actRule(chapter: number, act: number): boolean {
  return actOf(chapter) >= act;
}

/**
 * The affixes (systems/affixes.ts):
 * - shield: blocks the next hit of any kind, shieldBlocks of them, one more back every shieldRegen;
 * - haste: its cooldowns run hastePercent fast and every hasteHowl it howls like a wolf leader (the mobs around it run fast);
 * - split: every `steps`-th of its health lost (and its fall) sends out splitShards bone crawlers;
 * - explode: every `steps`-th of its health lost (and its fall) sends out a ring of explodeBullets
 *   bullets and marks a circle of explodeRadius on itself, which goes off after the usual warning.
 * A foe holds them as a bit mask in AFFIXES order.
 */
export type Affix = 'shield' | 'haste' | 'split' | 'explode';
export const AFFIXES: readonly Affix[] = ['shield', 'haste', 'split', 'explode'];

export const AFFIX = {
  shieldBlocks: 3,
  shieldRegen: ticks(2),
  hastePercent: 150,
  hasteHowl: ticks(5),
  steps: 4,
  splitShards: 3,
  splitSpread: toFp(70),
  explodeBullets: 12,
  explodeRadius: toFp(190),
};

export function hasAffix(mask: number, a: Affix): boolean {
  return (mask & (1 << AFFIXES.indexOf(a))) !== 0;
}

/** The affixes of mask `mask`, in AFFIXES order. */
export function affixList(mask: number): Affix[] {
  return AFFIXES.filter((a) => hasAffix(mask, a));
}
