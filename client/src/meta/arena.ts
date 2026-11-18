import { ARENA } from '@hk/engine';
import type { RunSetup } from '../game/runSetup';
import { BALANCE } from './balance';
import { challengeBonus } from './challenge';
import { earnedSutras } from './progress';
import type { SaveData } from './save';

// The arena (docs/design.md "Arena"): a lobby mode of its own, open once chapter 1 is cleared. One
// endless run inside walls (the engine's arena.ts), the horde coming in through gates; it lasts until
// the hero falls, with no revive, and pays copper for the minutes survived. Its best is a board of its
// own. No chests, stars, chapter progress or grit: the same field for everyone, for co-op later.

export interface ArenaBalance {
  /** Chapters cleared before the arena opens. */
  unlockCleared: number;
  /** Copper per minute survived (simulated time), up to copperCap. */
  copperPerMinute: number;
  copperCap: number;
}

/** An arena run's score: further waves, then longer survived (tenths of a simulated second). */
export interface ArenaScore {
  waves: number;
  tenths: number;
}

/** Whether the lobby offers the arena. */
export function arenaOpen(save: SaveData): boolean {
  return save.cleared >= BALANCE.arena.unlockCleared;
}

/** An arena run: the chapter's horde, the worn gear, training and blessings (no grit or novice bonus), and no revive. */
export function arenaSetup(save: SaveData): RunSetup {
  return {
    chapter: ARENA.chapter, waves: ARENA.waves, revives: 0, relic: save.relic, sutras: earnedSutras(save),
    bonus: challengeBonus(save), hard: false, monk: save.monk, firstRun: false, arena: true,
  };
}

/** Copper for `tenths` survived. */
export function arenaCopper(tenths: number): number {
  const { copperPerMinute, copperCap } = BALANCE.arena;
  return Math.min(copperCap, Math.floor((Math.max(0, tenths) * copperPerMinute) / 600));
}

/** Whether `a` beats `b`. */
export function arenaBetter(a: ArenaScore, b: ArenaScore): boolean {
  return a.waves > b.waves || (a.waves === b.waves && a.tenths > b.tenths);
}

export interface ArenaReward {
  copper: number;
  /** The best before this run, and whether this run beat it. */
  before: ArenaScore;
  newBest: boolean;
}

/** Pays an ended arena run that reached `run.waves` waves in `run.tenths`, and keeps the best. */
export function settleArena(save: SaveData, run: ArenaScore): { save: SaveData; reward: ArenaReward } {
  const copper = arenaCopper(run.tenths);
  const before = save.arenaBest;
  const newBest = arenaBetter(run, before);
  return {
    save: { ...save, copper: save.copper + copper, runs: save.runs + 1, arenaBest: newBest ? { waves: run.waves, tenths: run.tenths } : before },
    reward: { copper, before, newBest },
  };
}

/** The lobby's card switches to the arena, where it is open. */
export function chooseArena(save: SaveData): SaveData {
  return arenaOpen(save) ? { ...save, arena: true } : save;
}

/** Whether the lobby's card shows the arena. */
export function showsArena(save: SaveData): boolean {
  return save.arena && arenaOpen(save);
}
