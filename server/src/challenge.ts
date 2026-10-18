import { ENGINE_VERSION } from '@hk/engine';
import { CHALLENGE_ID, type Challenge, type ReplayWire, type RunEntry } from './protocol';

// The challenge list (docs/design.md "Challenges"). A daily is a formula of its UTC day, so
// there is nothing to store or schedule: every server answers the same record for the same
// day. Weekly challenges (picked by hand, with a fixed loadout) come later; the record already
// has their fields.

export const DAY_MS = 86_400_000;
/** The daily's waves: the chapter's full run until the engine can end one on wave 20's mid-boss. */
export const DAILY_WAVES = 50;
/** A run that ends this long after its challenge closed still counts (it began before midnight). */
export const LATE_MS = 2 * 3600 * 1000;

/** The UTC day of `ms` as the number YYYYMMDD. */
export function ymdOf(ms: number): number {
  const d = new Date(ms);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** A day's seed: its date mixed into 1..2^31-2, so neighbouring days share nothing. */
export function dailySeed(ymd: number): number {
  let h = Math.imul(ymd ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return 1 + ((h >>> 0) % 0x7ffffffe);
}

/** The daily of the UTC day `ms` falls on. */
export function dailyOf(ms: number, engine = ENGINE_VERSION): Challenge {
  const start = Math.floor(ms / DAY_MS) * DAY_MS;
  const ymd = ymdOf(start);
  return { id: `d${ymd}`, kind: 'daily', start, end: start + DAY_MS, seed: dailySeed(ymd), chapter: 'furthest', waves: DAILY_WAVES, mutator: null, loadout: null, engine };
}

/** The challenges open at `now`. */
export function openChallenges(now: number): Challenge[] {
  return [dailyOf(now)];
}

/** The challenge `id` names, if a run may still be sent for it at `now` (open, or closed under LATE_MS ago). */
export function challengeFor(id: string, now: number): Challenge | null {
  if (!CHALLENGE_ID.test(id)) return null;
  for (const c of [dailyOf(now), dailyOf(now - LATE_MS)]) if (c.id === id && now < c.end + LATE_MS) return c;
  return null;
}

/**
 * Why a run and its replay cannot be a run of `c`, or null when they can (the cheap checks
 * before any re-simulation): the engine version, the seed, no revives, the chapter's normal
 * waves from the start, and the run's own fields matching its config.
 */
export function misfit(c: Challenge, run: RunEntry, replay: ReplayWire): string | null {
  const cfg = replay.config;
  if (replay.engine !== c.engine) return 'engine';
  if (cfg.seed !== c.seed) return 'seed';
  if (cfg.revives !== 0) return 'revives';
  if (cfg.waves !== c.waves || replay.wave !== 1) return 'waves';
  if (run.hard || cfg.hard !== false || cfg.firstRun === true) return 'mode';
  if (cfg.chapter !== run.chapter || (c.chapter !== 'furthest' && c.chapter !== run.chapter)) return 'chapter';
  if (cfg.relic !== run.relic || cfg.monk !== run.monk) return 'loadout';
  if (c.loadout && (cfg.relic !== c.loadout.relic || cfg.monk !== c.loadout.monk)) return 'loadout';
  return null;
}
