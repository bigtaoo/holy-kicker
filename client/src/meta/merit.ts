import { BALANCE } from './balance';
import { rollItems } from './gear';
import { payHaul, type Haul } from './haul';
import { bestChapter, chapterMul, unlockedRelics } from './progress';
import type { SaveData } from './save';

// The merit path (docs/design.md "Merit path"; the monk's Merit Book, the corgi's Medal Path): a
// free season track. Claiming tasks and goals earns points (daily.ts, goals.ts call `earnMerit`);
// each step of the track pays once its points are reached, all reached steps in one claim. A
// season lasts `days` UTC days from a fixed epoch, so every device and time zone agrees when it
// turns. No paid tier. Pure: functions take a save and `now` (ms) and return a new save.

export type MeritSource = 'task' | 'dailyBonus' | 'goal' | 'weekBonus';

export interface MeritStep {
  /** Points that open the step. */
  at: number;
  /** Copper, times the copper multiplier of the highest cleared stage. */
  copper?: number;
  jade?: number;
  /** Gear items, rolled one chapter past the highest cleared, as the shop's jade chest. */
  drops?: number;
}

export interface MeritBalance {
  /** The UTC date season 0 began, as yyyymmdd. */
  epoch: number;
  /** A season's length in days. */
  days: number;
  points: Record<MeritSource, number>;
  /** The track, in rising `at`. */
  steps: MeritStep[];
}

export interface Merit {
  season: number;
  points: number;
  /** Bit i: step i was paid. */
  claimed: number;
}

const M = BALANCE.merit;
const DAY = 24 * 3600 * 1000;
const EPOCH_DAY = Date.UTC(Math.floor(M.epoch / 10000), Math.floor(M.epoch / 100) % 100 - 1, M.epoch % 100) / DAY;

function utcDay(now: number): number {
  return Math.floor(now / DAY);
}

/** The season `now` falls in, 0 before the epoch. */
export function seasonOf(now: number): number {
  return Math.max(0, Math.floor((utcDay(now) - EPOCH_DAY) / M.days));
}

/** The ms from `now` to the next season. */
export function untilNextSeason(now: number): number {
  return (EPOCH_DAY + (seasonOf(now) + 1) * M.days) * DAY - now;
}

export function newMerit(season = 0): Merit {
  return { season, points: 0, claimed: 0 };
}

const count = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);

/** A valid Merit from whatever a save held. */
export function parseMerit(v: unknown): Merit {
  if (v === null || typeof v !== 'object') return newMerit();
  const raw = v as Record<string, unknown>;
  return { season: count(raw.season, 99999), points: count(raw.points, 999999), claimed: count(raw.claimed, 2 ** M.steps.length - 1) };
}

/** This season's merit: the stored one, or a fresh one once the season has turned. */
export function thisSeason(save: SaveData, now: number): Merit {
  const season = seasonOf(now);
  return save.merit.season === season ? save.merit : newMerit(season);
}

/** The save with the points a claim from `source` earns. */
export function earnMerit(save: SaveData, now: number, source: MeritSource): SaveData {
  const m = thisSeason(save, now);
  return { ...save, merit: { ...m, points: m.points + M.points[source] } };
}

/** Steps reached and not yet paid. */
export function meritWaiting(m: Merit): number[] {
  return M.steps.flatMap((s, i) => (s.at <= m.points && !(m.claimed & (1 << i)) ? [i] : []));
}

export function meritClaimable(save: SaveData, now: number): number {
  return meritWaiting(thisSeason(save, now)).length;
}

/** The copper step `i` pays this save. */
export function stepCopper(save: SaveData, i: number): number {
  return Math.round((M.steps[i].copper ?? 0) * chapterMul(bestChapter(save)));
}

/** Pays every step reached and not yet paid, as one haul; null when none waits. */
export function claimMerit(save: SaveData, now: number, rand: () => number = Math.random): { save: SaveData; haul: Haul } | null {
  const m = thisSeason(save, now);
  const steps = meritWaiting(m);
  if (!steps.length) return null;
  const drops = steps.reduce((n, i) => n + (M.steps[i].drops ?? 0), 0);
  const chapter = Math.min(BALANCE.chapters, bestChapter(save) + 1);
  const haul: Haul = {
    copper: steps.reduce((n, i) => n + stepCopper(save, i), 0),
    jade: steps.reduce((n, i) => n + (M.steps[i].jade ?? 0), 0),
    drops: drops ? rollItems(chapter, drops, unlockedRelics(save), rand) : [],
  };
  const claimed = steps.reduce((bits, i) => bits | (1 << i), m.claimed);
  return { save: payHaul({ ...save, merit: { ...m, claimed } }, haul), haul };
}

/** Two saves' merit merged (saveMerge.ts): the same season keeps the more points and every claim; another keeps the later. */
export function mergeMerit(lead: Merit, other: Merit): Merit {
  if (lead.season !== other.season) return other.season > lead.season ? other : lead;
  return { season: lead.season, points: Math.max(lead.points, other.points), claimed: lead.claimed | other.claimed };
}
