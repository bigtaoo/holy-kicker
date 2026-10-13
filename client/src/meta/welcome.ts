import { BALANCE } from './balance';
import { bump, dayKey } from './daily';
import type { ItemId, Tier } from './gear';
import { payHaul, type Haul } from './haul';
import type { SaveData } from './save';

// Welcome gifts (docs/retention.md): a new player gets one when the first run ends, won or
// lost, and one more on each of the next days they come back, until BALANCE.welcome runs out.
// The results and the lobby name the next one, so there is something waiting tomorrow.
// Pure: functions take a save and `now` (ms) and return a new save.

export interface WelcomeGift {
  item: ItemId;
  tier: Tier;
  copper: number;
  jade: number;
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

export function giftHaul(gift: WelcomeGift): Haul {
  return { copper: gift.copper, jade: gift.jade, drops: [{ item: gift.item, tier: gift.tier }] };
}

/** Pays the waiting gift; null when none waits. `n` is its place, 0 for the first. */
export function claimGift(save: SaveData, now: number): { save: SaveData; haul: Haul; n: number } | null {
  const gift = nextGift(save);
  if (!gift || !giftReady(save, now)) return null;
  const haul = giftHaul(gift);
  return { save: { ...payHaul(save, haul), gifts: save.gifts + 1, giftDay: dayKey(now) }, haul, n: save.gifts };
}

/**
 * The save once a run is paid (progress.ts settleRun): today's task counters, and after the
 * very first run its day and the first gift, which the results show.
 */
export function afterRun(save: SaveData, now: number, waves: number, kills: number): { save: SaveData; gift: Haul | null } {
  let s = save.runs === 1 && save.firstDay === 0 ? { ...save, firstDay: dayKey(now) } : save;
  s = bump(bump(bump(s, now, 'runs', 1), now, 'waves', waves), now, 'kills', kills);
  const first = save.gifts === 0 && save.runs === 1 ? claimGift(s, now) : null;
  return first ? { save: first.save, gift: first.haul } : { save: s, gift: null };
}
