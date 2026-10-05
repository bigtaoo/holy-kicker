import { RELIC_IDS, type RelicId } from '@hk/engine';
import { BALANCE } from './balance';
import { mergeCodex, type EvolveId } from './codex';
import { newDaily, parseDaily, type Daily } from './daily';
import { emptyInventory, grantRelics, ITEM_IDS, TIERS, type Inventory } from './gear';

// The player's progress (docs/design.md "Save contents"). Plain JSON, versioned; parseSave
// turns whatever a store hands back (nothing, garbage, an older version) into a valid save.
// Settings such as the language are not part of it: they stay on the device (settings.ts).

export const SAVE_VERSION = 3;

export interface SaveData {
  version: number;
  /** False until the first run ends; the first launch goes straight into chapter 1. */
  firstRunDone: boolean;
  level: number;
  /** Experience towards the next level. */
  xp: number;
  copper: number;
  jade: number;
  /** The chapter the lobby shows (1-based). */
  chapter: number;
  /** Highest cleared chapter, 0 for none. */
  cleared: number;
  /** Best waves cleared per chapter, index 0 is chapter 1. */
  best: number[];
  /** Claimed progress chests per chapter, one bit per chest in BALANCE.chests order. */
  chests: number[];
  runs: number;
  /** The relic chosen for the next run (docs/content.md "Relics": one more per chapter cleared). */
  relic: RelicId;
  /** Evolutions and awakenings done at least once, in Codex order (codex.ts). */
  codex: EvolveId[];
  /** Owned gear, counts per item and tier (gear.ts); unlocked relics have at least one copy. */
  gear: Inventory;
  /** Training nodes bought, in line order (training.ts). */
  trained: number;
  /** When the patrol started piling up (ms since the epoch), 0 before it opens (patrol.ts). */
  patrol: number;
  /** Today's tasks, chests and quick patrols (daily.ts). */
  daily: Daily;
  /** Lobby tabs opened at least once, bit i for TABS[i] (progress.ts): an open tab not yet seen gets a dot. */
  seen: number;
  /** Lost tries on the first uncleared chapter, each worth BALANCE.grit.bonus there (loadout.ts). */
  grit: number;
}

export function newSave(): SaveData {
  const zeros = () => new Array<number>(BALANCE.chapters).fill(0);
  return {
    version: SAVE_VERSION, firstRunDone: false, level: 1, xp: 0, copper: 0, jade: 0,
    chapter: 1, cleared: 0, best: zeros(), chests: zeros(), runs: 0, relic: 'ball', codex: [],
    gear: grantRelics(emptyInventory(), ['ball']), trained: 0, patrol: 0, daily: newDaily(), seen: 0, grit: 0,
  };
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback;
}

function ints(v: unknown, min: number, max: number): number[] {
  const out = new Array<number>(BALANCE.chapters).fill(0);
  if (Array.isArray(v)) for (let i = 0; i < out.length; i++) out[i] = int(v[i], min, max, 0);
  return out;
}

function inventory(v: unknown): Inventory {
  const out = emptyInventory();
  if (v === null || typeof v !== 'object') return out;
  const raw = v as Record<string, unknown>;
  for (const id of ITEM_IDS) {
    const counts = raw[id];
    if (Array.isArray(counts)) for (let t = 0; t < TIERS; t++) out[id][t] = int(counts[t], 0, Number.MAX_SAFE_INTEGER, 0);
  }
  return out;
}

/**
 * A valid save from stored text. Missing or broken text gives a new save; every field is
 * checked on its own, so one bad value does not throw away the rest of the progress.
 * Version 1 had no gear or training: it reads as none, and its unlocked relics get their copy.
 * Version 2 had no patrol or daily counters: the patrol starts in the lobby, the day afresh.
 */
export function parseSave(text: string | null): SaveData {
  const fresh = newSave();
  if (!text) return fresh;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return fresh;
    raw = parsed as Record<string, unknown>;
  } catch {
    return fresh;
  }
  const max = Number.MAX_SAFE_INTEGER;
  const cleared = int(raw.cleared, 0, BALANCE.chapters, 0);
  return {
    version: SAVE_VERSION,
    firstRunDone: raw.firstRunDone === true,
    level: int(raw.level, 1, 999, 1),
    xp: int(raw.xp, 0, max, 0),
    copper: int(raw.copper, 0, max, 0),
    jade: int(raw.jade, 0, max, 0),
    // the shown chapter can never be past the first uncleared one
    chapter: int(raw.chapter, 1, Math.min(BALANCE.chapters, cleared + 1), 1),
    cleared,
    best: ints(raw.best, 0, BALANCE.waves),
    chests: ints(raw.chests, 0, (1 << BALANCE.chests.length) - 1),
    runs: int(raw.runs, 0, max, 0),
    // only a relic the clears have unlocked
    relic: RELIC_IDS.indexOf(raw.relic as RelicId) >= 0 && RELIC_IDS.indexOf(raw.relic as RelicId) <= cleared ? (raw.relic as RelicId) : 'ball',
    codex: Array.isArray(raw.codex) ? mergeCodex(raw.codex) : [],
    gear: grantRelics(inventory(raw.gear), RELIC_IDS.slice(0, cleared + 1)),
    trained: int(raw.trained, 0, BALANCE.training.nodes, 0),
    patrol: int(raw.patrol, 0, max, 0),
    daily: parseDaily(raw.daily),
    // a save from before the dots has seen every tab it could open
    seen: int(raw.seen, 0, 0xff, 0xff),
    grit: int(raw.grit, 0, BALANCE.grit.max, 0),
  };
}
