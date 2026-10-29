import type { MonkId, Stat } from '@hk/engine';
import { BALANCE } from './balance';
import { dayKey, noteRun } from './daily';
import { bestTier, isRelic, itemStats, type Drop, type ItemId, type Tier } from './gear';
import { payHaul, type Haul } from './haul';
import { monkPrice, ownsMonk } from './monks';
import type { SaveData } from './save';
import type { RunTally } from './taskPool';

// Welcome gifts (docs/retention.md): a new player gets one when the first run ends, won or
// lost, and one more on each of the next days they come back, until BALANCE.welcome runs out
// (a week, ending in a monk). A missed day costs nothing: the next gift waits for the next
// visit. The results and the lobby's calendar (ui/giftPanel.ts) name the next one, so there is
// something waiting tomorrow, and the results say when the first one is worn in the next run.
// Pure: functions take a save and `now` (ms) and return a new save.

export interface WelcomeGift {
  /** The gear given at `tier`: 'relic' is the relic chosen when it is claimed, null for none. */
  item: ItemId | 'relic' | null;
  tier: Tier;
  copper: number;
  jade: number;
  /** A monk given; one already owned pays its price in jade instead. */
  monk?: MonkId;
}

/** The first gift as the results show it: what it paid, what it adds to the worn gear, and tomorrow's. */
export interface FirstGift extends Haul {
  gain: Partial<Record<Stat, number>> | null;
  next: Haul | null;
}

const GIFTS = BALANCE.welcome;

/** The next gift to claim, or null once every one is claimed. */
export function nextGift(save: SaveData): WelcomeGift | null {
  return GIFTS[save.gifts] ?? null;
}

/** A gift waits: after the first run, one a local day. */
export function giftReady(save: SaveData, now: number): boolean {
  return save.firstRunDone && nextGift(save) !== null && save.giftDay !== dayKey(now);
}

/** The gift's gear as `save` would get it, or null for none. */
export function giftDrop(save: SaveData, gift: WelcomeGift): Drop | null {
  return gift.item === null ? null : { item: gift.item === 'relic' ? save.relic : gift.item, tier: gift.tier };
}

export function giftHaul(save: SaveData, gift: WelcomeGift): Haul {
  const drop = giftDrop(save, gift);
  const owned = gift.monk !== undefined && ownsMonk(save, gift.monk);
  return {
    copper: gift.copper,
    jade: gift.jade + (owned ? monkPrice(gift.monk!) : 0),
    drops: drop ? [drop] : [],
    ...(gift.monk && !owned ? { monk: gift.monk } : {}),
  };
}

/** Pays the waiting gift; null when none waits. `n` is its place, 0 for the first. */
export function claimGift(save: SaveData, now: number): { save: SaveData; haul: Haul; n: number } | null {
  const gift = nextGift(save);
  if (!gift || !giftReady(save, now)) return null;
  const haul = giftHaul(save, gift);
  return { save: { ...payHaul(save, haul), gifts: save.gifts + 1, giftDay: dayKey(now) }, haul, n: save.gifts };
}

/**
 * What `drop` adds to the gear worn in `save` (before it is paid): the stats it raises over the
 * item worn now, or null when it would not be worn. The best tier owned is worn (gear.ts), so a
 * gift better than what is owned, or one for an empty slot, is equipped by itself; a relic is
 * worn only when it is the chosen one, since the relic picks the run's weapon.
 */
export function giftGain(save: SaveData, drop: Drop): Partial<Record<Stat, number>> | null {
  const was = bestTier(save.gear, drop.item);
  if (drop.tier <= was || (isRelic(drop.item) && drop.item !== save.relic)) return null;
  const before = was === -1 ? {} : itemStats(drop.item, was);
  const gain: Partial<Record<Stat, number>> = {};
  for (const [stat, n] of Object.entries(itemStats(drop.item, drop.tier)) as [Stat, number][]) {
    const up = n - (before[stat] ?? 0);
    if (up > 0) gain[stat] = up;
  }
  return gain;
}

/**
 * The save once a run is paid (progress.ts settleRun): today's task counters, and after the
 * very first run its day and the first gift, which the results show with what it adds.
 */
export function afterRun(save: SaveData, now: number, run: RunTally): { save: SaveData; gift: FirstGift | null } {
  let s = save.runs === 1 && save.firstDay === 0 ? { ...save, firstDay: dayKey(now) } : save;
  s = noteRun(s, now, run);
  const first = save.gifts === 0 && save.runs === 1 ? claimGift(s, now) : null;
  if (!first) return { save: s, gift: null };
  const drop = first.haul.drops[0];
  const next = nextGift(first.save);
  return { save: first.save, gift: { ...first.haul, gain: drop ? giftGain(s, drop) : null, next: next && giftHaul(first.save, next) } };
}
