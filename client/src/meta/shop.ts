import { BALANCE } from './balance';
import { bump, today } from './daily';
import { rollItems } from './gear';
import { payHaul, type Haul } from './haul';
import { bestChapter, chapterMul, unlockedRelics } from './progress';
import type { SaveData } from './save';

// The shop (docs/design.md "Retention", "Ads and monetization"): a free chest a day, a few ad
// chests a day that also pay jade, a jade chest with no limit whose gear comes from one
// chapter past the highest cleared, and a few copper chests a day, so the copper training
// cannot take yet buys gear for the merges. Pure: takes a save and `now` (ms), returns a new save.

export type ChestKind = 'free' | 'ad' | 'copper' | 'jade';
export const CHEST_KINDS: readonly ChestKind[] = ['free', 'ad', 'copper', 'jade'];

export interface ShopBalance {
  freeChest: { copper: number; drops: number };
  adChest: { perDay: number; jade: number; drops: number };
  jadeChest: { jade: number; drops: number };
  /** Priced at `copper` times the highest cleared chapter's copper multiplier. */
  copperChest: { perDay: number; copper: number; drops: number };
}

const SHOP = BALANCE.shop;

/** Chests of `kind` left today; null for no daily limit. */
export function chestsLeft(save: SaveData, now: number, kind: ChestKind): number | null {
  const d = today(save, now);
  if (kind === 'free') return Math.max(0, 1 - d.free);
  if (kind === 'ad') return Math.max(0, SHOP.adChest.perDay - d.adChests);
  if (kind === 'copper') return Math.max(0, SHOP.copperChest.perDay - d.copperChests);
  return null;
}

/** What a copper chest costs: more as the chapters, and the copper they pay, go up. */
export function copperChestPrice(save: SaveData): number {
  return Math.round(SHOP.copperChest.copper * chapterMul(bestChapter(save)));
}

/** Why a chest cannot be opened now: none left today, or the jade or copper is short. */
export function chestBlock(save: SaveData, now: number, kind: ChestKind): 'used' | 'jade' | 'copper' | null {
  if (chestsLeft(save, now, kind) === 0) return 'used';
  if (kind === 'jade' && save.jade < SHOP.jadeChest.jade) return 'jade';
  return kind === 'copper' && save.copper < copperChestPrice(save) ? 'copper' : null;
}

/** What a chest pays before its gear is rolled: copper, jade, how many items and from which chapter. */
export function chestContents(save: SaveData, kind: ChestKind): { copper: number; jade: number; drops: number; chapter: number } {
  const best = bestChapter(save);
  if (kind === 'free') return { copper: Math.round(SHOP.freeChest.copper * chapterMul(best)), jade: 0, drops: SHOP.freeChest.drops, chapter: best };
  if (kind === 'ad') return { copper: 0, jade: SHOP.adChest.jade, drops: SHOP.adChest.drops, chapter: best };
  if (kind === 'copper') return { copper: 0, jade: 0, drops: SHOP.copperChest.drops, chapter: best };
  return { copper: 0, jade: 0, drops: SHOP.jadeChest.drops, chapter: Math.min(BALANCE.chapters, best + 1) };
}

/** Opens a chest (an ad chest's ad already watched); null when it is blocked. */
export function openChest(save: SaveData, now: number, kind: ChestKind, rand: () => number = Math.random): { save: SaveData; haul: Haul } | null {
  if (chestBlock(save, now, kind)) return null;
  const c = chestContents(save, kind);
  const haul: Haul = { copper: c.copper, jade: c.jade, drops: rollItems(c.chapter, c.drops, unlockedRelics(save), rand) };
  const d = today(save, now);
  const daily = kind === 'free' ? { ...d, free: d.free + 1 }
    : kind === 'ad' ? { ...d, adChests: d.adChests + 1 }
    : kind === 'copper' ? { ...d, copperChests: d.copperChests + 1 } : d;
  const jade = save.jade - (kind === 'jade' ? SHOP.jadeChest.jade : 0);
  const copper = save.copper - (kind === 'copper' ? copperChestPrice(save) : 0);
  const paid = payHaul({ ...save, daily, jade, copper }, haul);
  return { save: bump(paid, now, 'chests', 1), haul };
}
