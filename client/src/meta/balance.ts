import type { MonkId } from '@hk/engine';
import type { AchievementGoal } from './achievements';
import type { Stat } from '@hk/engine';
import data from './balance.json';
import type { DailyBalance } from './daily';
import type { GearBalance } from './gear';
import type { PatrolBalance } from './patrol';
import type { ShopBalance } from './shop';
import type { TrainingBalance } from './training';

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
  grit: GritBalance;
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
  gear: GearBalance;
  training: TrainingBalance;
  shop: ShopBalance;
  patrol: PatrolBalance;
  daily: DailyBalance;
  /** The long-term goals and the jade each pays once (achievements.ts), at most 30. */
  achievements: AchievementGoal[];
  /** Jade price of each monk (monks.ts); the kicker is free. */
  monks: Record<MonkId, number>;
}

/**
 * Grit (loadout.ts): every lost run on the first uncleared chapter that got at least `minWaves`
 * far adds `bonus` to the next tries there, up to `max` times; clearing it starts over. It
 * turns the long tail of unlucky tries into a few.
 */
export interface GritBalance {
  max: number;
  minWaves: number;
  bonus: Partial<Record<Stat, number>>;
}

/**
 * An achievement that grants a sutra: reach wave `n` in any chapter, record `n` Codex entries,
 * finish `n` runs, or clear chapter `n`.
 */
export interface SutraGoal {
  kind: 'wave' | 'codex' | 'runs' | 'clear';
  n: number;
}

export const BALANCE: Balance = data as unknown as Balance;
