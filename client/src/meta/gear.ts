import { RELIC_IDS, type RelicId, type Stat } from '@hk/engine';
import { BALANCE } from './balance';
import type { SaveData } from './save';

// Gear (docs/design.md "Meta progression"): six slots, five tiers, one item per slot except
// the relic slot, which holds the relic the run is played with. Items stack as counts per
// tier; MERGE_COUNT of one item and tier plus copper make one of the next tier. The best tier
// owned is what is worn, so there is nothing to equip by hand. Every tier raises the item's
// main stats and adds one more affix. Pure: functions take a save and return a new one.

export type GearSlot = 'relic' | 'pendant' | 'bracers' | 'robe' | 'sash' | 'sandals';
export const GEAR_SLOTS: readonly GearSlot[] = ['relic', 'pendant', 'bracers', 'robe', 'sash', 'sandals'];

/** An item: one per slot, and every relic is an item of the relic slot. */
export type ItemId = Exclude<GearSlot, 'relic'> | RelicId;
export const ITEM_IDS: readonly ItemId[] = ['pendant', 'bracers', 'robe', 'sash', 'sandals', ...RELIC_IDS];

export const TIERS = 5;
/** Common, Fine, Refined, Treasured, Sacred (tier.0 .. tier.4 in the string tables). */
export type Tier = 0 | 1 | 2 | 3 | 4;

/** Owned items: for each item, how many of each tier (index 0 is Common). */
export type Inventory = Record<ItemId, number[]>;

export interface ItemDef {
  /** Main stats, one value per tier. */
  main: Partial<Record<Stat, number[]>>;
  /** Affixes, one more per tier above Common. */
  affixes: [Stat, number][];
}

export interface GearBalance {
  mergeCount: number;
  /** Copper to merge up from tier i (index 0: Common -> Fine). */
  mergeCopper: number[];
  /** A full drop every this many waves cleared; the rest of the waves give a chance at one. */
  dropEveryWaves: number;
  /** Per stage (progress.ts `stage`: chapters 1-5, then hard mode 6-10), the weight of each tier a drop comes in. */
  dropTiers: number[][];
  items: Record<GearSlot, ItemDef>;
}

export interface Drop {
  item: ItemId;
  tier: Tier;
}

const GEAR = BALANCE.gear;

export function isRelic(item: ItemId): item is RelicId {
  return (RELIC_IDS as readonly string[]).includes(item);
}

export function slotOf(item: ItemId): GearSlot {
  return isRelic(item) ? 'relic' : item;
}

export function emptyInventory(): Inventory {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, new Array<number>(TIERS).fill(0)])) as Inventory;
}

/** The best tier of an item owned, or -1 for none. */
export function bestTier(inv: Inventory, item: ItemId): Tier | -1 {
  for (let t = TIERS - 1; t >= 0; t--) if (inv[item][t] > 0) return t as Tier;
  return -1;
}

/** What an item gives at a tier: its main stats and its affixes up to that tier, summed. */
export function itemStats(item: ItemId, tier: Tier): Partial<Record<Stat, number>> {
  const def = GEAR.items[slotOf(item)];
  const out: Partial<Record<Stat, number>> = {};
  const add = (stat: Stat, n: number) => (out[stat] = (out[stat] ?? 0) + n);
  for (const [stat, perTier] of Object.entries(def.main) as [Stat, number[]][]) add(stat, perTier[tier]);
  for (let i = 0; i < tier; i++) add(def.affixes[i][0], def.affixes[i][1]);
  return out;
}

/** The item worn in each slot and its tier: the best owned, the relic slot holding the chosen relic. */
export function worn(save: SaveData): { slot: GearSlot; item: ItemId; tier: Tier | -1 }[] {
  return GEAR_SLOTS.map((slot) => {
    const item: ItemId = slot === 'relic' ? save.relic : slot;
    return { slot, item, tier: bestTier(save.gear, item) };
  });
}

/** The stats all worn gear gives. */
export function gearStats(save: SaveData): Partial<Record<Stat, number>> {
  const out: Partial<Record<Stat, number>> = {};
  for (const { item, tier } of worn(save)) {
    if (tier === -1) continue;
    for (const [stat, n] of Object.entries(itemStats(item, tier)) as [Stat, number][]) out[stat] = (out[stat] ?? 0) + n;
  }
  return out;
}

export function mergeCost(tier: Tier): number {
  return GEAR.mergeCopper[tier];
}

/** Whether a merge up from this item and tier can go ahead now: enough copies and copper. */
export function canMerge(save: SaveData, item: ItemId, tier: Tier): boolean {
  return tier < TIERS - 1 && save.gear[item][tier] >= GEAR.mergeCount && save.copper >= mergeCost(tier);
}

/** MERGE_COUNT copies and the copper become one item of the next tier. */
export function merge(save: SaveData, item: ItemId, tier: Tier): SaveData {
  if (!canMerge(save, item, tier)) return save;
  const counts = save.gear[item].slice();
  counts[tier] -= GEAR.mergeCount;
  counts[tier + 1]++;
  return { ...save, copper: save.copper - mergeCost(tier), gear: { ...save.gear, [item]: counts } };
}

/**
 * Every merge the copper allows, lowest tiers first so their results can merge again; the
 * merges done come back in order, for the summary.
 */
export function mergeAll(save: SaveData): { save: SaveData; done: Drop[] } {
  const done: Drop[] = [];
  let s = save;
  for (let tier = 0 as Tier; tier < TIERS - 1; tier = (tier + 1) as Tier) {
    for (const item of ITEM_IDS) {
      while (canMerge(s, item, tier)) {
        s = merge(s, item, tier);
        done.push({ item, tier: (tier + 1) as Tier });
      }
    }
  }
  return { save: s, done };
}

/** Items that can drop: the five slot items and the relics the player has unlocked. */
function dropPool(relics: readonly RelicId[]): ItemId[][] {
  return GEAR_SLOTS.map((slot) => (slot === 'relic' ? [...relics] : [slot]));
}

function pickWeighted(weights: readonly number[], rand: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * What a run drops: one item per dropEveryWaves waves cleared and a chance at one more for
 * the rest, at least one when `first` (the first run always drops one). The slot is even,
 * the tier comes from the chapter's weights. `rand` gives [0, 1).
 */
export function rollDrops(chapter: number, waves: number, relics: readonly RelicId[], first: boolean, rand: () => number): Drop[] {
  const every = GEAR.dropEveryWaves;
  let n = Math.floor(waves / every) + (rand() < (waves % every) / every ? 1 : 0);
  if (first) n = Math.max(1, n);
  return rollItems(chapter, n, relics, rand);
}

/** `n` items with an even slot and the tier from `chapter`'s weights (chests, patrol). */
export function rollItems(chapter: number, n: number, relics: readonly RelicId[], rand: () => number): Drop[] {
  const pool = dropPool(relics);
  const tiers = GEAR.dropTiers[Math.min(GEAR.dropTiers.length, Math.max(1, chapter)) - 1];
  const out: Drop[] = [];
  for (let i = 0; i < n; i++) {
    const items = pool[Math.floor(rand() * pool.length)];
    out.push({ item: items[Math.floor(rand() * items.length)], tier: pickWeighted(tiers, rand) as Tier });
  }
  return out;
}

export function addDrops(inv: Inventory, drops: readonly Drop[]): Inventory {
  const out = { ...inv };
  for (const d of drops) {
    out[d.item] = out[d.item].slice();
    out[d.item][d.tier]++;
  }
  return out;
}

/** A relic just unlocked comes as one Common copy, so it can be worn and merged. */
export function grantRelics(inv: Inventory, relics: readonly RelicId[]): Inventory {
  const missing = relics.filter((r) => bestTier(inv, r) < 0);
  return missing.length ? addDrops(inv, missing.map((item) => ({ item, tier: 0 }))) : inv;
}
