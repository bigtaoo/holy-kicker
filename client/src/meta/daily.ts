import { BALANCE } from './balance';
import { thisWeek } from './goals';
import { earnMerit } from './merit';
import type { SaveData } from './save';
import {
  boardBonusReady, boardClaimable, boardState, bumpBoard, drawTasks, mergeBoards, parseBoard, parseTasks, runBoard,
  type Board, type PoolEntry, type RunTally, type Task, type TaskKind, type TaskState,
} from './taskPool';

// The day's counters (docs/design.md "Retention"): daily tasks (drawn per day, taskPool.ts; this week's
// goals in goals.ts count along, and each claim earns merit, merit.ts), the shop's free and ad
// chests, quick patrols. All of them reset when the device's local date changes; a clock moved back a day simply starts another day. Pure: functions take a save and `now` (ms) and return a new save.

export type { TaskKind, TaskState } from './taskPool';

/** A task as balance.json lists it. */
export interface TaskGoal {
  kind: TaskKind;
  n: number;
}

export interface DailyBalance {
  /** Tasks drawn per day from `pool` (taskPool.ts). */
  count: number;
  pool: PoolEntry[];
  /** The tasks on a new player's first day (SaveData.firstDay): easier to reach. */
  firstDay: TaskGoal[];
  /** The fixed tasks of saves before version 8, kept for a day stored by one. */
  legacy: TaskGoal[];
  /** What each task pays when claimed. */
  copper: number;
  jade: number;
  /** Paid once every task is claimed. */
  bonusJade: number;
}

/** The day's board (taskPool.ts) and counters. */
export interface Daily extends Board {
  /** The local date these counters belong to, as yyyymmdd. */
  day: number;
  /** Shop chests opened today. */
  free: number;
  adChests: number;
  copperChests: number;
  /** Quick patrols today, paid with an ad or with jade. */
  quickAds: number;
  quickJade: number;
}

const DAILY = BALANCE.daily;

/** The local date of `now` as yyyymmdd. */
export function dayKey(now: number): number {
  const d = new Date(now);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** The ms from `now` to the next local midnight, when dayKey turns and the daily counters refill. */
export function untilNextDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}

const goals = (list: readonly TaskGoal[]): Task[] => list.map((g) => ({ kind: g.kind, n: g.n, id: '' }));

/** The tasks of day `day`: the easy set on the player's first day, else a draw from the pool. */
export function dayTasks(save: SaveData, day: number): Task[] {
  return save.firstDay !== 0 && save.firstDay === day ? goals(DAILY.firstDay) : drawTasks(DAILY.pool, DAILY.count, save, day);
}

export function newDaily(day = 0, tasks: Task[] = []): Daily {
  return { day, free: 0, adChests: 0, copperChests: 0, quickAds: 0, quickJade: 0, tasks, progress: tasks.map(() => 0), claimed: 0, bonus: false };
}

function int(v: unknown, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
}

/** A valid Daily from whatever a save held; a day stored before version 8 keeps its fixed tasks (`firstDay`: the save's). */
export function parseDaily(v: unknown, firstDay = 0): Daily {
  if (v === null || typeof v !== 'object') return newDaily();
  const raw = v as Record<string, unknown>;
  const big = Number.MAX_SAFE_INTEGER;
  const day = int(raw.day, 99999999);
  const legacy = day !== 0 && day === firstDay ? DAILY.firstDay : DAILY.legacy;
  const tasks = parseTasks(raw.tasks) ?? (raw.tasks === undefined && day !== 0 ? goals(legacy) : []);
  return {
    day,
    free: int(raw.free, big),
    adChests: int(raw.adChests, big),
    copperChests: int(raw.copperChests, big),
    quickAds: int(raw.quickAds, big),
    quickJade: int(raw.quickJade, big),
    ...parseBoard(raw, tasks),
  };
}

/** Two saves' counters merged (saveMerge.ts): the same day keeps the most of every counter, the most progress and every claim, so a chest or a task is never paid twice; another day keeps the later. */
export function mergeDaily(lead: Daily, other: Daily): Daily {
  if (lead.day !== other.day) return other.day > lead.day ? other : lead;
  return {
    ...mergeBoards(lead, other),
    free: Math.max(lead.free, other.free),
    adChests: Math.max(lead.adChests, other.adChests),
    copperChests: Math.max(lead.copperChests, other.copperChests),
    quickAds: Math.max(lead.quickAds, other.quickAds),
    quickJade: Math.max(lead.quickJade, other.quickJade),
  };
}

/** Today's counters: the stored ones, or fresh ones with the day's tasks once the date has changed. */
export function today(save: SaveData, now: number): Daily {
  const day = dayKey(now);
  if (save.daily.day !== day) return newDaily(day, dayTasks(save, day));
  return save.daily.tasks.length ? save.daily : { ...save.daily, ...parseBoard({}, dayTasks(save, day)) };
}

/** The save with today's counters, so a stale day never shows. */
export function rollDay(save: SaveData, now: number): SaveData {
  const daily = today(save, now);
  return daily === save.daily ? save : { ...save, daily };
}

/** Adds `n` to every task of `kind`, today's and this week's (goals.ts). */
export function bump(save: SaveData, now: number, kind: TaskKind, n: number): SaveData {
  if (n <= 0) return save;
  return { ...save, daily: bumpBoard(today(save, now), kind, n), weekly: bumpBoard(thisWeek(save, now), kind, n) };
}

/** Counts a finished run on the boards. */
export function noteRun(save: SaveData, now: number, run: RunTally): SaveData {
  return { ...save, daily: runBoard(today(save, now), run), weekly: runBoard(thisWeek(save, now), run) };
}

/** What task `i` of the day `d` asks for. */
export function taskGoal(d: Daily, i: number): number {
  return d.tasks[i].n;
}

export function taskState(d: Daily, i: number): TaskState {
  return boardState(d, i);
}

/** Tasks that can be claimed now, plus the bonus once it is ready. */
export function claimable(save: SaveData, now: number): number {
  return boardClaimable(today(save, now));
}

/** The bonus waits for every task to be claimed. */
export function bonusReady(d: Daily): boolean {
  return boardBonusReady(d);
}

/** Pays task `i` when it is done and not yet claimed. */
export function claimTask(save: SaveData, now: number, i: number): SaveData {
  const d = today(save, now);
  if (i < 0 || i >= d.tasks.length || boardState(d, i) !== 'ready') return save;
  return earnMerit({
    ...save,
    copper: save.copper + DAILY.copper,
    jade: save.jade + DAILY.jade,
    daily: { ...d, claimed: d.claimed | (1 << i) },
  }, now, 'task');
}

/** Pays the bonus for claiming every task. */
export function claimBonus(save: SaveData, now: number): SaveData {
  const d = today(save, now);
  if (!boardBonusReady(d)) return save;
  return bump(earnMerit({ ...save, jade: save.jade + DAILY.bonusJade, daily: { ...d, bonus: true } }, now, 'dailyBonus'), now, 'daily', 1);
}

/** Daily tasks open after the first run. */
export function tasksOpen(save: SaveData): boolean {
  return save.firstRunDone;
}
