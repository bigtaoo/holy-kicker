import { BALANCE } from './balance';
import type { SaveData } from './save';

// The day's counters (docs/design.md "Retention"): daily tasks, the shop's free and ad chests,
// quick patrols. All of them reset when the device's local date changes; a clock moved back a
// day simply starts another day. Pure: functions take a save and `now` (ms) and return a new save.

export type TaskKind = 'runs' | 'waves' | 'kills' | 'chests' | 'patrol';

export interface TaskGoal {
  kind: TaskKind;
  n: number;
}

export interface DailyBalance {
  tasks: TaskGoal[];
  /** What each task pays when claimed. */
  copper: number;
  jade: number;
  /** Paid once every task is claimed. */
  bonusJade: number;
}

export interface Daily {
  /** The local date these counters belong to, as yyyymmdd. */
  day: number;
  /** Shop chests opened today. */
  free: number;
  adChests: number;
  /** Quick patrols today, paid with an ad or with jade. */
  quickAds: number;
  quickJade: number;
  /** Progress per task, in BALANCE.daily.tasks order. */
  progress: number[];
  /** Claimed tasks, one bit each. */
  claimed: number;
  bonus: boolean;
}

const DAILY = BALANCE.daily;

/** The local date of `now` as yyyymmdd. */
export function dayKey(now: number): number {
  const d = new Date(now);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function newDaily(day = 0): Daily {
  return { day, free: 0, adChests: 0, quickAds: 0, quickJade: 0, progress: DAILY.tasks.map(() => 0), claimed: 0, bonus: false };
}

function int(v: unknown, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
}

/** A valid Daily from whatever a save held. */
export function parseDaily(v: unknown): Daily {
  if (v === null || typeof v !== 'object') return newDaily();
  const raw = v as Record<string, unknown>;
  const big = Number.MAX_SAFE_INTEGER;
  const progress = Array.isArray(raw.progress) ? raw.progress : [];
  return {
    day: int(raw.day, 99999999),
    free: int(raw.free, big),
    adChests: int(raw.adChests, big),
    quickAds: int(raw.quickAds, big),
    quickJade: int(raw.quickJade, big),
    progress: DAILY.tasks.map((_, i) => int(progress[i], big)),
    claimed: int(raw.claimed, (1 << DAILY.tasks.length) - 1),
    bonus: raw.bonus === true,
  };
}

/** Today's counters: the stored ones, or fresh ones once the date has changed. */
export function today(save: SaveData, now: number): Daily {
  const day = dayKey(now);
  return save.daily.day === day ? save.daily : newDaily(day);
}

/** The save with today's counters, so a stale day never shows. */
export function rollDay(save: SaveData, now: number): SaveData {
  const daily = today(save, now);
  return daily === save.daily ? save : { ...save, daily };
}

/** Adds `n` to every task of `kind`. */
export function bump(save: SaveData, now: number, kind: TaskKind, n: number): SaveData {
  if (n <= 0) return save;
  const d = today(save, now);
  const progress = d.progress.map((p, i) => (DAILY.tasks[i].kind === kind ? p + n : p));
  return { ...save, daily: { ...d, progress } };
}

export type TaskState = 'locked' | 'open' | 'ready' | 'claimed';

/** The patrol's task waits for the patrol (BALANCE.unlocks.patrolChapter). */
export function taskLocked(save: SaveData, i: number): boolean {
  return DAILY.tasks[i].kind === 'patrol' && save.cleared < BALANCE.unlocks.patrolChapter;
}

export function taskState(save: SaveData, d: Daily, i: number): TaskState {
  if (d.claimed & (1 << i)) return 'claimed';
  if (taskLocked(save, i)) return 'locked';
  return d.progress[i] >= DAILY.tasks[i].n ? 'ready' : 'open';
}

/** Tasks that can be claimed now, plus the bonus once it is ready. */
export function claimable(save: SaveData, now: number): number {
  const d = today(save, now);
  const ready = DAILY.tasks.filter((_, i) => taskState(save, d, i) === 'ready').length;
  return ready + (bonusReady(save, d) ? 1 : 0);
}

/** The bonus waits for every task the player can do yet: locked ones do not hold it back. */
export function bonusReady(save: SaveData, d: Daily): boolean {
  return !d.bonus && DAILY.tasks.every((_, i) => taskState(save, d, i) === 'claimed' || taskState(save, d, i) === 'locked');
}

/** Pays task `i` when it is done and not yet claimed. */
export function claimTask(save: SaveData, now: number, i: number): SaveData {
  const d = today(save, now);
  if (taskState(save, d, i) !== 'ready') return save;
  return {
    ...save,
    copper: save.copper + DAILY.copper,
    jade: save.jade + DAILY.jade,
    daily: { ...d, claimed: d.claimed | (1 << i) },
  };
}

/** Pays the bonus for claiming every task. */
export function claimBonus(save: SaveData, now: number): SaveData {
  const d = today(save, now);
  if (!bonusReady(save, d)) return save;
  return { ...save, jade: save.jade + DAILY.bonusJade, daily: { ...d, bonus: true } };
}

/** Daily tasks open after the first run. */
export function tasksOpen(save: SaveData): boolean {
  return save.firstRunDone;
}
