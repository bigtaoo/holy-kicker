import type { MonkId } from '@hk/engine';
import type { AchievementGoal } from './achievements';
import type { Stat } from '@hk/engine';
import data from './balance.json';
import type { DailyBalance } from './daily';
import type { LowHealthBalance } from '../game/lowHealth';
import type { GearBalance } from './gear';
import type { PatrolBalance } from './patrol';
import type { ShopBalance } from './shop';
import type { TrainingBalance } from './training';
import type { WelcomeGift } from './welcome';

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
  /** The low-health warning (game/lowHealth.ts): when the heart beats and how fast. */
  lowHealth: LowHealthBalance;
  grit: GritBalance;
  novice: NoviceBalance;
  copperPerWave: number;
  copperChapterStep: number;
  chests: Chest[];
  /** Extra copper per shrine offering the run won, percent of the wave copper. */
  offeringPercent: number;
  xpPerWave: number;
  levelXpBase: number;
  levelXpStep: number;
  /** The level the first training node opens at (each next node one level later), and the codex's chapter. */
  unlocks: { trainLevel: number; codexChapter: number };
  /** What earns each sutra (progress.ts sutraGoal), in SUTRA_IDS order. */
  sutras: SutraGoal[];
  gear: GearBalance;
  training: TrainingBalance;
  shop: ShopBalance;
  patrol: PatrolBalance;
  daily: DailyBalance;
  /** A new player's welcome gifts (welcome.ts), one a day from the first run's day. */
  welcome: WelcomeGift[];
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
/**
 * A new player's first `runs` runs of chapter 1, before it is ever cleared, get `bonus` on top of
 * any grit (loadout.ts), so the first runs reach the twenties and a clear comes within a few tries.
 */
export interface NoviceBalance {
  runs: number;
  bonus: Partial<Record<Stat, number>>;
}

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
