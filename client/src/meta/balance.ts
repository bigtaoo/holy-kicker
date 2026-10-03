import data from './balance.json';

// Balance numbers live in balance.json, never in code, so they can move to remote config
// later (docs/design.md "Platforms, saves and server"). All values are starting points.

export interface Chest {
  wave: number;
  copper: number;
  jade: number;
}

export interface Balance {
  chapters: number;
  waves: number;
  /** Rewarded-ad revives per run; wave length and the wave plan are engine rules (engine/config.ts). */
  revives: number;
  copperPerWave: number;
  copperChapterStep: number;
  chests: Chest[];
  /** Extra copper per shrine offering the run won, percent of the wave copper. */
  offeringPercent: number;
  xpPerWave: number;
  levelXpBase: number;
  levelXpStep: number;
  unlocks: { trainLevel: number; shopChapter: number; codexChapter: number };
  /** What earns each sutra (progress.ts sutraGoal), in SUTRA_IDS order. */
  sutras: SutraGoal[];
}

/**
 * An achievement that grants a sutra: reach wave `n` in any chapter, record `n` Codex entries,
 * finish `n` runs, or clear chapter `n`.
 */
export interface SutraGoal {
  kind: 'wave' | 'codex' | 'runs' | 'clear';
  n: number;
}

export const BALANCE: Balance = data as Balance;
