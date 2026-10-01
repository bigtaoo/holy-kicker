import { BALANCE } from './balance';

// The player's progress (docs/design.md "Save contents"). Plain JSON, versioned; parseSave
// turns whatever a store hands back (nothing, garbage, an older version) into a valid save.
// Settings such as the language are not part of it: they stay on the device (settings.ts).

export const SAVE_VERSION = 1;

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
}

export function newSave(): SaveData {
  const zeros = () => new Array<number>(BALANCE.chapters).fill(0);
  return {
    version: SAVE_VERSION, firstRunDone: false, level: 1, xp: 0, copper: 0, jade: 0,
    chapter: 1, cleared: 0, best: zeros(), chests: zeros(), runs: 0,
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

/**
 * A valid save from stored text. Missing or broken text gives a new save; every field is
 * checked on its own, so one bad value does not throw away the rest of the progress.
 * Migrations from older versions go here, keyed on `version`.
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
  };
}
