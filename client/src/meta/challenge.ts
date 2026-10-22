import { ENGINE_VERSION, STATS, mutatorOf, type Stat, type StatBonus } from '@hk/engine';
import type { Challenge } from '@hk/protocol';
import { BALANCE } from './balance';
import { mergeCodex } from './codex';
import { gearStats } from './gear';
import { chapterMul, earnedSutras, playableChapters } from './progress';
import type { SaveData } from './save';
import { trainingStats } from './training';
import type { RunSetup } from '../game/runSetup';
import { weeklySetup, type WeeklyBalance } from './weekly';
import { blessingBonus } from './unlocks';

// The daily challenge (docs/design.md "Challenges"): one shared run a UTC day, built from the
// server's record (net/backend.ts challenges) with the player's own loadout. The first finished
// run of the day counts and pays its milestones; later ones are practice and pay nothing. Counted
// dailies on days in a row make a streak that pays a little jade more each day up to a cap; a
// missed day starts it again from one, nothing else is lost. Pure: takes a save and the record,
// returns a new save.

const DAY_MS = 86_400_000;

export interface Milestone {
  /** Waves cleared to reach it (20: the mid-boss down). */
  wave: number;
  copper: number;
  jade: number;
}

export interface ChallengeBalance {
  /** The player level the challenge opens at. */
  unlockLevel: number;
  /** Copper grows with the chapter played (progress.ts chapterMul); together about one full clear's copper. */
  milestones: Milestone[];
  /** The weekly's rewards (weekly.ts). */
  weekly: WeeklyBalance;
  /** The daily streak's bonus: `jade` per day of the streak, counted up to `cap` days. */
  streak: { jade: number; cap: number };
}

/** Where the daily stands for this player: closed below the level, on another engine version, counted, or open. */
export type ChallengeState = 'locked' | 'update' | 'done' | 'open';

export function challengeState(save: SaveData, c: Challenge, engine = ENGINE_VERSION): ChallengeState {
  if (save.level < BALANCE.challenge.unlockLevel || !save.firstRunDone) return 'locked';
  if (c.engine !== engine) return 'update';
  return save.challenge === c.id ? 'done' : 'open';
}

/** The chapter the player plays: the record's, or their furthest unlocked one on the normal track. */
export function challengeChapter(save: SaveData, c: Challenge): number {
  return c.chapter === 'furthest' ? playableChapters(save) : c.chapter;
}

/** What a run of `c` is set up with (a weekly: its fixed loadout, weekly.ts): the record's seed, waves and mutator, no revives, the player's relic, monk, sutras, gear and training (no grit or head start: they are not the same for everyone at a level). */
export function challengeSetup(save: SaveData, c: Challenge): RunSetup {
  if (c.loadout) return weeklySetup(c);
  return {
    chapter: challengeChapter(save, c), waves: c.waves, revives: 0, relic: save.relic, sutras: earnedSutras(save),
    bonus: challengeBonus(save), hard: false, monk: save.monk, firstRun: false, seed: c.seed, mutator: mutatorOf(c.mutator),
  };
}

/** The engine stats of the worn gear, the training line and the star blessings (loadout.ts without grit and the novice bonus). */
export function challengeBonus(save: SaveData): StatBonus {
  const gear = gearStats(save);
  const trained = trainingStats(save);
  const blessed = blessingBonus(save);
  const bonus: Partial<Record<Stat, number>> = {};
  for (const stat of STATS) {
    const n = (gear[stat] ?? 0) + (trained[stat] ?? 0) + (blessed[stat] ?? 0);
    if (n) bonus[stat] = n;
  }
  return bonus;
}

/** Milestone `m` as paid on chapter `chapter`. */
export function milestonePay(m: Milestone, chapter: number): Milestone {
  return { wave: m.wave, copper: Math.round(m.copper * chapterMul(chapter)), jade: m.jade };
}

export interface ChallengeReward {
  /** This run was the day's counted one (else practice, paying nothing). */
  counted: boolean;
  /** The milestones it reached, as paid. */
  reached: Milestone[];
  /** Their sum; the copper is the part a rewarded ad doubles. */
  copper: number;
  /** The milestones' and the streak's jade. */
  jade: number;
  /** The streak this counted daily made (0 for practice), and the part of `jade` it paid. */
  streak: number;
  streakJade: number;
}

/** The UTC day number of a challenge (its start's). */
export function challengeDay(c: Challenge): number {
  return Math.floor(c.start / DAY_MS);
}

/** The daily streak as it stands on UTC day `day`: kept through yesterday's counted run, else broken (0). */
export function streakOn(save: SaveData, day: number): number {
  return save.streakDay >= day - 1 ? save.streak : 0;
}

/** The best waves of `c`'s runs so far, 0 before the first. */
export function dailyBestOf(save: SaveData, c: Challenge): number {
  return save.dailyBest.id === c.id ? save.dailyBest.waves : 0;
}

/** The streak's bonus jade on its `n`th day. */
export function streakJade(n: number): number {
  const b = BALANCE.challenge.streak;
  return Math.min(n, b.cap) * b.jade;
}

/** What a finished challenge run reached: waves fully cleared, enemies defeated, evolutions made. */
export interface ChallengeResult {
  waves: number;
  kills: number;
  evolved?: readonly string[];
}

/**
 * Settles a finished run of `c` on `chapter`: the day's first pays its milestones and marks the
 * day done; any run counts as a run (the run and kill totals, the Codex), like a chapter run.
 * Waves, chests, drops and experience stay with the chapters (progress.ts settleRun).
 */
export function settleChallenge(save: SaveData, c: Challenge, chapter: number, run: ChallengeResult): { save: SaveData; reward: ChallengeReward } {
  const counted = save.challenge !== c.id;
  const reached = counted ? BALANCE.challenge.milestones.filter((m) => run.waves >= m.wave).map((m) => milestonePay(m, chapter)) : [];
  const copper = reached.reduce((n, m) => n + m.copper, 0);
  const day = challengeDay(c);
  const streak = !counted ? 0 : save.streakDay === day - 1 ? save.streak + 1 : save.streakDay === day ? save.streak : 1;
  const bonus = counted ? streakJade(streak) : 0;
  const jade = reached.reduce((n, m) => n + m.jade, 0) + bonus;
  const streaked = counted ? { streak, streakDay: day, bestStreak: Math.max(save.bestStreak, streak) } : {};
  return {
    save: {
      ...save, ...streaked, challenge: c.id, dailyBest: { id: c.id, waves: Math.max(dailyBestOf(save, c), Math.floor(run.waves)) }, copper: save.copper + copper, jade: save.jade + jade,
      runs: save.runs + 1, kills: save.kills + Math.max(0, Math.floor(run.kills)), codex: mergeCodex(save.codex, run.evolved),
    },
    reward: { counted, reached, copper, jade, streak, streakJade: bonus },
  };
}

/** Whole hours until `end` (at least 1 while it is still ahead), counted on the server's clock. */
export function hoursLeft(end: number, serverNow: number): number {
  return Math.max(end > serverNow ? 1 : 0, Math.ceil((end - serverNow) / 3_600_000));
}
