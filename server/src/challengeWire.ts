import { BOARD_SUFFIX, boardSuffix, type Game } from './game';
import type { BoardReply, ReplayWire, RunEntry } from './protocol';

// The challenges' wire format (docs/design.md "Challenges"), re-exported by protocol.ts so the
// client reads it as @hk/protocol. Pure, like the rest of the protocol.

export const CHALLENGE_KINDS = ['daily', 'weekly'] as const;
export type ChallengeKind = (typeof CHALLENGE_KINDS)[number];

/** A weekly challenge's fixed run: the same relic, monk, sutras and chapter for everyone, no gear. */
export interface ChallengeLoadout {
  relic: string;
  monk: string;
  sutras: string[];
  chapter: number;
}

/**
 * A challenge as `GET /v1/challenge` lists it; the client builds its run from this alone.
 * Ids: `d20261019` for a UTC day, `w2026-43` for an ISO week.
 */
export interface Challenge {
  id: string;
  kind: ChallengeKind;
  /** When it opens and closes (ms, UTC). */
  start: number;
  end: number;
  seed: number;
  /** The chapter played: the same for everyone, or 'furthest', each player's furthest unlocked one. */
  chapter: number | 'furthest';
  /** Waves the run plays (the chapter's full 50 until the engine can end a run early). */
  waves: number;
  /** The run's mutator (RunConfig.mutator, engine/mutators.ts), null for none. */
  mutator: string | null;
  /** The weekly's fixed loadout; null when players bring their own (the daily). */
  loadout: ChallengeLoadout | null;
  /** The ENGINE_VERSION runs are verified with: a client on another one shows "update to play". */
  engine: number;
}

/** `GET /v1/challenge`: the open challenges, and the server's clock to count their time left from. */
export interface ChallengeList {
  now: number;
  challenges: Challenge[];
}

/** `POST /v1/challenge/runs`: a finished challenge run with its replay, which the server re-simulates. */
export interface ChallengeRun {
  challenge: string;
  run: RunEntry;
  replay: ReplayWire;
}

/**
 * The reply to a challenge run. `pending`: it would rank in the board's top RESIM_TOP, so it
 * enters once re-simulated; `ranked`: on the board on the plausibility check alone; `repeat`:
 * the install already sent its run for this daily (the first counts); `lower`: a weekly run no
 * better than the install's best this week, which stands. `rank` is the place the install's run
 * holds, or will hold once verified, of `total`.
 */
export interface ChallengeRunReply {
  board: string;
  status: 'pending' | 'ranked' | 'repeat' | 'lower';
  rank: number;
  total: number;
  tag: string;
}

/**
 * A challenge board (`GET /v1/challenge/boards/<board>`); `pending` when `mine` waits for its
 * check. A weekly board also lists its top WATCH_TOP verified runs' pick timelines, and whether
 * their replay can be watched (`GET /v1/challenge/boards/<board>/replays/<tag>`).
 */
export interface ChallengeBoardReply extends BoardReply {
  pending: boolean;
  top?: TopRun[];
}

/** One of a weekly board's top runs: its pick timeline, and whether its replay is kept to watch. */
export interface TopRun {
  tag: string;
  picks: PickWire[];
  replay: boolean;
}

/**
 * One level-up or shrine of a re-simulated run, for the pick timeline: the tick and wave it came
 * on, the cards offered (`kind:id`, evolutions as `evolve:<id>`) and the index of the one taken.
 */
export interface PickWire {
  tick: number;
  wave: number;
  offered: string[];
  took: number;
}

/** Runs that would rank this high are re-simulated before they enter a board. */
export const RESIM_TOP = 100;
/** A weekly board's top this many runs publish their pick timeline and replay. */
export const WATCH_TOP = 3;

/** A challenge board: one per challenge, engine version, chapter and game (game.ts boardSuffix). */
export function challengeBoardId(challenge: string, engine: number, chapter: number, game?: Game): string {
  return `${challenge}-e${engine}-c${chapter}${boardSuffix(game)}`;
}

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
/** A run that ends this long after its challenge closed still counts (it began before the close); a week's ranks are final after it. */
export const LATE_MS = 2 * 3600 * 1000;

/** Monday 00:00 UTC of the week `ms` falls in (1970-01-01 was a Thursday). */
export function weekStart(ms: number): number {
  return Math.floor((ms + 3 * DAY_MS) / WEEK_MS) * WEEK_MS - 3 * DAY_MS;
}

/** The ISO week of `ms` as `w2026-43`: the year of its Thursday, and which Thursday of that year it is. */
export function weekIdOf(ms: number): string {
  const thursday = weekStart(ms) + 3 * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const n = Math.floor((thursday - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
  return `w${year}-${String(n).padStart(2, '0')}`;
}

export const CHALLENGE_ID = /^(d\d{8}|w\d{4}-\d{2})$/;
export const CHALLENGE_BOARD = new RegExp(String.raw`^(d\d{8}|w\d{4}-\d{2})-e\d{1,6}-c[1-9]\d?${BOARD_SUFFIX}$`);

/** "Top N %": the share of the board at or above `rank`, rounded up, at least 1. */
export function topPercent(rank: number, total: number): number {
  if (rank < 1 || total < 1) return 100;
  return Math.max(1, Math.min(100, Math.ceil((rank * 100) / total)));
}

/**
 * A weekly rank's tier, for its reward and the mark beside the name the next week: 3 for the top
 * WATCH_TOP, 2 for the top 10 %, 1 for the top 50 %, else 0.
 */
export function weekTier(rank: number, total: number): 0 | 1 | 2 | 3 {
  if (rank < 1 || total < 1 || rank > total) return 0;
  if (rank <= WATCH_TOP) return 3;
  if (rank * 10 <= total) return 2;
  return rank * 2 <= total ? 1 : 0;
}
