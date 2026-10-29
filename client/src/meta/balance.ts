import type { MonkId } from '@hk/engine';
import type { AchievementGoal } from './achievements';
import type { Stat } from '@hk/engine';
import data from './balance.json';
import type { ChallengeBalance } from './challenge';
import type { DailyBalance } from './daily';
import type { GoalsBalance } from './goals';
import type { MeritBalance } from './merit';
import type { LowHealthBalance } from '../game/lowHealth';
import type { GearBalance } from './gear';
import type { PatrolBalance } from './patrol';
import type { ReminderBalance } from './reminders';
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
  /** How many chapters on a hard chapter pays and drops as (progress.ts stage). */
  hardStage: number;
  /** A run's third star: the hero's health never under `lowest` percent (progress.ts runStars). */
  stars: { lowest: number };
  waves: number;
  /** Rewarded-ad revives per run; wave length and the wave plan are engine rules (engine/config.ts). */
  revives: number;
  /** At most one interstitial every this many minutes of play, on every host (platform/adPacing.ts). */
  ads: { interstitialMinutes: number };
  /** The low-health warning (game/lowHealth.ts): when the heart beats and how fast. */
  lowHealth: LowHealthBalance;
  grit: GritBalance;
  novice: NoviceBalance;
  /** Seconds the level-up cards stand open untouched before a hand taps the suggested one (ui/cardNudge.ts). */
  cardNudge: { after: number };
  copperPerWave: number;
  copperChapterStep: number;
  chests: Chest[];
  /** Extra copper per shrine offering the run won, percent of the wave copper. */
  offeringPercent: number;
  xpPerWave: number;
  levelXpBase: number;
  levelXpStep: number;
  /**
   * The level the first training node opens at (each next node one level later), the codex's
   * chapter, and the chapter to clear for each relic (RELIC_IDS order) and before each monk can be
   * bought (unlocks.ts, docs/unlocks.md).
   */
  unlocks: { trainLevel: number; codexChapter: number; relics: number[]; monks: Record<MonkId, number> };
  /** Star blessings (unlocks.ts): a permanent bonus of `n` to `stat` once the normal chapters' stars total `stars`. */
  blessings: Blessing[];
  /** What earns each sutra (progress.ts sutraGoal), in SUTRA_IDS order. */
  sutras: SutraGoal[];
  gear: GearBalance;
  training: TrainingBalance;
  shop: ShopBalance;
  patrol: PatrolBalance;
  /** The iOS app's local reminders (reminders.ts): when they are offered and when they ring. */
  reminders: ReminderBalance;
  daily: DailyBalance;
  goals: GoalsBalance;
  /** The merit path's seasons, points and track (merit.ts). */
  merit: MeritBalance;
  /** A new player's welcome gifts (welcome.ts), one a day from the first run's day. */
  welcome: WelcomeGift[];
  /** The long-term goals and the jade each pays once (achievements.ts), one bit of `achieved` each; new ones go last. */
  achievements: AchievementGoal[];
  /** Jade price of each monk (monks.ts); the kicker is free. */
  monks: Record<MonkId, number>;
  fall: FallBalance;
  firstRun: FirstRunBalance;
  /** The daily challenge (challenge.ts): the player level it opens at and its milestones. */
  challenge: ChallengeBalance;
}

/**
 * A new player's first run: the engine seed it always plays (so its card deals are known), and
 * how many level-ups take a card by themselves (ui/runWatch.ts autoPick). Seed 92 was the best of
 * 200 for the casual and standing-still balance bots with 5 spell-first picks (2026-10-17);
 * client/src/game/firstRun.test.ts locks its first cards, so an engine change that reshuffles
 * them fails there and wants the seed search run again.
 */
export interface FirstRunBalance {
  seed: number;
  autoPicks: number;
}

/**
 * The death panel's "under-levelled" verdict (ui/deathInfo.ts): `levels[i]` is the level a hero
 * normally has on wave `levelEvery * (i + 1)` (straight between, level 1 on wave 0), and a death
 * at least `levelGap` levels below it blames the level. Measured with the balance bots (casual
 * and skilled, chapter 1, seeds 1-8, no meta upgrades, 2026-10-16): both medians, which agree
 * within a level; the standing-still bot sits 4-6 levels below from wave 5 on.
 */
export interface FallBalance {
  levelEvery: number;
  levels: number[];
  levelGap: number;
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

export interface Blessing {
  stars: number;
  stat: Stat;
  n: number;
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
