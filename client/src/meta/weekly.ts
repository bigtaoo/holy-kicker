import { ENGINE_VERSION, mutatorOf, type MonkId, type RelicId, type SutraId } from '@hk/engine';
import { CHALLENGE_BOARD, LATE_MS, weekTier, type Challenge } from '@hk/protocol';
import type { RunSetup } from '../game/runSetup';
import { BALANCE } from './balance';
import type { ChallengeResult } from './challenge';
import { mergeCodex } from './codex';
import type { SaveData } from './save';

// The weekly challenge (docs/design.md "Challenges"): one run a week, Monday to Monday UTC, the
// same fixed loadout for everyone (the record's relic, monk, sutras and chapter, owned or not; no
// gear, training or revives). Any number of runs; the board keeps each player's best. A week with
// a finished run is noted in the save; once its ranks are final the next launch pays it: jade for
// taking part, more for the top half, the top tenth and the top three. Pure.

export interface WeeklyBalance {
  /** Jade for a week with a finished run, whatever its rank. */
  participation: number;
  /** Jade added for each tier (protocol weekTier): the top 50 %, the top 10 % and the top three. */
  tiers: number[];
}

/** A week with a finished run, kept until it is paid: its board, when it closes and the best waves cleared. */
export interface WeekEntry {
  id: string;
  board: string;
  end: number;
  best: number;
}

/** Weeks kept at once; an older unpaid one makes room (a player offline for two months). */
export const WEEKS_KEPT = 8;

/** Where the weekly stands for this player: closed until chapter 1 is cleared, or on another engine version. */
export type WeeklyState = 'locked' | 'update' | 'open';

export function weeklyState(save: SaveData, c: Challenge, engine = ENGINE_VERSION): WeeklyState {
  if (save.cleared < 1) return 'locked';
  return c.engine !== engine ? 'update' : 'open';
}

/** What a run of the weekly `c` is set up with: the record's whole loadout, seed, waves and mutator, and nothing of the player's. */
export function weeklySetup(c: Challenge): RunSetup {
  const l = c.loadout!;
  return {
    chapter: l.chapter, waves: c.waves, revives: 0, relic: l.relic as RelicId, sutras: l.sutras as SutraId[],
    bonus: {}, hard: false, monk: l.monk as MonkId, firstRun: false, seed: c.seed, mutator: mutatorOf(c.mutator),
  };
}

/** The player's week `id` in the save, if it has a finished run. */
export function weekOf(save: SaveData, id: string): WeekEntry | undefined {
  return save.weeks.find((w) => w.id === id);
}

/**
 * Settles a finished run of the weekly `c` on `board`: the week noted with its best waves (to pay
 * once it closes), and the run counted as a run (totals, the Codex). `before`: the best waves
 * before this run, 0 for the week's first.
 */
export function settleWeekly(save: SaveData, c: Challenge, board: string, run: ChallengeResult): { save: SaveData; before: number } {
  const old = weekOf(save, c.id);
  const entry: WeekEntry = { id: c.id, board, end: c.end, best: Math.max(old?.best ?? 0, run.waves) };
  const weeks = [entry, ...save.weeks.filter((w) => w.id !== c.id)].slice(0, WEEKS_KEPT);
  return {
    save: { ...save, weeks, runs: save.runs + 1, kills: save.kills + Math.max(0, Math.floor(run.kills)), codex: mergeCodex(save.codex, run.evolved) },
    before: old?.best ?? 0,
  };
}

/** The noted weeks whose ranks are final at `now` (on the server's clock): closed, and past the late window. */
export function closedWeeks(save: SaveData, now: number): WeekEntry[] {
  return save.weeks.filter((w) => now >= w.end + LATE_MS);
}

/** A closed week as paid: its rank of `total` (0 when it has none: never sent, or no answer), tier and jade. */
export interface WeekClaim {
  week: WeekEntry;
  rank: number;
  total: number;
  tier: 0 | 1 | 2 | 3;
  jade: number;
}

/** What closed week `week` pays at `rank` of `total`: the participation jade, plus each tier reached. */
export function weekClaim(week: WeekEntry, rank: number, total: number): WeekClaim {
  const b = BALANCE.challenge.weekly;
  const tier = weekTier(rank, total);
  return { week, rank, total, tier, jade: b.participation + b.tiers.slice(0, tier).reduce((n, j) => n + j, 0) };
}

/** Pays a claim once: its jade added and its week gone from the save. */
export function claimWeek(save: SaveData, claim: WeekClaim): SaveData {
  if (!weekOf(save, claim.week.id)) return save;
  return { ...save, jade: save.jade + claim.jade, weeks: save.weeks.filter((w) => w.id !== claim.week.id) };
}

/** The save's weeks as read back: well-formed entries only, at most WEEKS_KEPT, one per week. */
export function parseWeeks(v: unknown): WeekEntry[] {
  if (!Array.isArray(v)) return [];
  const out: WeekEntry[] = [];
  for (const w of v as Partial<WeekEntry>[]) {
    if (!w || typeof w.id !== 'string' || !/^w\d{4}-\d{2}$/.test(w.id) || out.some((o) => o.id === w.id)) continue;
    if (typeof w.board !== 'string' || !CHALLENGE_BOARD.test(w.board) || !w.board.startsWith(`${w.id}-`)) continue;
    if (!Number.isSafeInteger(w.end) || !Number.isInteger(w.best) || (w.best as number) < 0 || (w.best as number) > BALANCE.waves) continue;
    out.push({ id: w.id, board: w.board, end: w.end as number, best: w.best as number });
  }
  return out.slice(0, WEEKS_KEPT);
}
