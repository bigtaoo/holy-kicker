// The wire format between the game and its backend (server/README.md): analytics batches and
// leaderboard runs. Shared as source by the client (`@hk/protocol`) and the server, so both
// sides agree on names and limits. Pure: no Node or browser APIs.

/** Hosts the game ships on. */
export const HOSTS = ['web', 'crazygames', 'poki', 'wechat'] as const;
export type Host = (typeof HOSTS)[number];

/**
 * Analytics event names. `session` opens a play session; `run_start` / `run_end` bracket a
 * chapter run; `tutorial` marks the first run's hints done; `buy` a lobby purchase; `ad` a
 * rewarded ad watched to the end; `claim` a daily task, achievement or patrol paid out.
 *
 * `buy` has `item` (`chest` with `kind`, `patrol` with `pay`, `monk` with `monk`, `train` with
 * `node`) and `spent` (copper for training, jade otherwise). `claim` has `what` (`task` with
 * `task`, `bonus`, `achievement` with `goal` and `all` from Claim all, `patrol` with `hours` and
 * `double`). Chests and patrols also carry their haul: `copper`, `jade` and `drops`.
 */
export const EVENT_NAMES = ['session', 'run_start', 'run_end', 'tutorial', 'buy', 'ad', 'claim'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type PropValue = string | number | boolean;

export interface ClientEvent {
  e: EventName;
  /** Client clock, ms since the epoch (the server keeps its own receive time too). */
  t: number;
  p?: Record<string, PropValue>;
}

export interface EventBatch {
  /** A random id kept by the install for good (not tied to any account). */
  install: string;
  /** A random id per launch. */
  session: string;
  host: Host;
  build: string;
  locale: string;
  events: ClientEvent[];
}

export const LIMITS = {
  idMin: 8,
  idMax: 64,
  batchEvents: 50,
  props: 12,
  propKey: 24,
  propString: 64,
  build: 32,
  locale: 16,
  /** A batch may be sent this late (ms; a phone offline for a day) or this early (clock skew). */
  late: 7 * 24 * 3600 * 1000,
  early: 24 * 3600 * 1000,
  chapters: 5,
  /** Waves a chapter has; a run can not go further. */
  waves: 50,
  /** A run can not be shorter than this many seconds per wave reached, nor longer than this. */
  minSecondsPerWave: 4,
  maxSeconds: 4 * 3600,
  maxLevel: 200,
  maxKills: 1_000_000,
} as const;

/** A finished chapter run sent to the leaderboard. */
export interface RunEntry {
  install: string;
  host: Host;
  build: string;
  chapter: number;
  hard: boolean;
  won: boolean;
  /** The wave reached (the last one when won). */
  wave: number;
  /** Seconds played, to a tenth (simulated time, so pauses and ads do not count). */
  tenths: number;
  level: number;
  kills: number;
  monk: string;
  relic: string;
}

/** A board's id: the chapter and the mode. */
export function boardId(chapter: number, hard: boolean): string {
  return `c${chapter}${hard ? 'h' : ''}`;
}

/**
 * What a run ranks by, higher is better: a win beats any loss, then further waves, then less
 * time. One integer so the database sorts on a single indexed field.
 */
export function runScore(r: Pick<RunEntry, 'won' | 'wave' | 'tenths'>): number {
  const fast = Math.max(0, 999_999 - Math.min(999_999, r.tenths));
  return (r.won ? 1 : 0) * 1e9 + r.wave * 1e6 + fast;
}

/** One row of a board as the server sends it. `tag` stands for the install without revealing it. */
export interface BoardRow {
  rank: number;
  tag: string;
  won: boolean;
  wave: number;
  tenths: number;
  level: number;
  monk: string;
  relic: string;
}

export interface BoardReply {
  board: string;
  total: number;
  rows: BoardRow[];
  /** The asking install's own row, when it has one. */
  mine: BoardRow | null;
}
