import { BALANCE } from './balance';
import { rollItems } from './gear';
import { payHaul, type Haul } from './haul';
import { earnMerit } from './merit';
import { bestChapter, unlockedRelics } from './progress';
import type { SaveData } from './save';
import {
  boardBonusReady, boardClaimable, boardState, drawTasks, mergeBoards, parseBoard, parseTasks, type Board, type PoolEntry,
} from './taskPool';

// The weekly goals (docs/design.md "Weekly goals"): bigger tasks drawn per local week from their own
// pool, the board resetting on Monday. Each goal pays copper and jade; claiming all of them opens a
// jade chest; each claim earns merit (merit.ts). Daily.ts feeds the board alongside the day's
// (bump, noteRun); this module never imports it. Pure: functions take a save and `now` (ms) and
// return a new save.

export interface GoalsBalance {
  /** Goals drawn per week from `pool` (taskPool.ts). */
  count: number;
  pool: PoolEntry[];
  /** What each goal pays when claimed. */
  copper: number;
  jade: number;
  /** Items in the chest paid once every goal is claimed, rolled one chapter past the highest cleared, as the shop's jade chest. */
  bonusDrops: number;
}

/** The week's board. */
export interface Weekly extends Board {
  /** The local date of the week's Monday, as yyyymmdd. */
  week: number;
}

const GOALS = BALANCE.goals;

/** Keeps a week's draw apart from its Monday's daily draw. */
const WEEK_SALT = 0x2f6b;

function monday(now: number): Date {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

/** The local date of the Monday starting `now`'s week, as yyyymmdd. */
export function weekKey(now: number): number {
  const d = monday(now);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** The ms from `now` to next Monday's local midnight, when the goals reset. */
export function untilNextWeek(now: number): number {
  const d = monday(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime() - now;
}

export function newWeekly(week = 0, tasks: Board['tasks'] = []): Weekly {
  return { week, ...parseBoard({}, tasks) };
}

/** A valid Weekly from whatever a save held. */
export function parseWeekly(v: unknown): Weekly {
  if (v === null || typeof v !== 'object') return newWeekly();
  const raw = v as Record<string, unknown>;
  const week = typeof raw.week === 'number' && Number.isFinite(raw.week) ? Math.min(99999999, Math.max(0, Math.floor(raw.week))) : 0;
  return { week, ...parseBoard(raw, parseTasks(raw.tasks) ?? []) };
}

/** The goals of week `week`. */
export function weekGoals(save: SaveData, week: number): Board['tasks'] {
  return drawTasks(GOALS.pool, GOALS.count, save, week ^ WEEK_SALT);
}

/** This week's board: the stored one, or a fresh draw once the week has turned. */
export function thisWeek(save: SaveData, now: number): Weekly {
  const week = weekKey(now);
  if (save.weekly.week !== week) return newWeekly(week, weekGoals(save, week));
  return save.weekly.tasks.length ? save.weekly : { week, ...parseBoard({}, weekGoals(save, week)) };
}

/** Two saves' weeks merged (saveMerge.ts): the same week keeps the most progress and every claim; another keeps the later. */
export function mergeWeekly(lead: Weekly, other: Weekly): Weekly {
  if (lead.week !== other.week) return other.week > lead.week ? other : lead;
  return mergeBoards(lead, other);
}

/** Goals that can be claimed now, plus the chest once it is ready. */
export function goalsClaimable(save: SaveData, now: number): number {
  return boardClaimable(thisWeek(save, now));
}

/** Pays goal `i` when it is done and not yet claimed. */
export function claimGoal(save: SaveData, now: number, i: number): SaveData {
  const w = thisWeek(save, now);
  if (i < 0 || i >= w.tasks.length || boardState(w, i) !== 'ready') return save;
  return earnMerit({ ...save, copper: save.copper + GOALS.copper, jade: save.jade + GOALS.jade, weekly: { ...w, claimed: w.claimed | (1 << i) } }, now, 'goal');
}

/** Opens the week's chest once every goal is claimed; null before. */
export function claimWeekBonus(save: SaveData, now: number, rand: () => number = Math.random): { save: SaveData; haul: Haul } | null {
  const w = thisWeek(save, now);
  if (!boardBonusReady(w)) return null;
  const chapter = Math.min(BALANCE.chapters, bestChapter(save) + 1);
  const haul: Haul = { copper: 0, jade: 0, drops: rollItems(chapter, GOALS.bonusDrops, unlockedRelics(save), rand) };
  return { save: earnMerit(payHaul({ ...save, weekly: { ...w, bonus: true } }, haul), now, 'weekBonus'), haul };
}
