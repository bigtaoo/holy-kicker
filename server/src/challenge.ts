import { ENGINE_VERSION, MONK_IDS, MUTATOR_IDS, RELIC_IDS, SUTRA_IDS } from '@hk/engine';
import { CHALLENGE_ID, DAILY_WAVES, DAY_MS, LATE_MS, WEEK_MS, dailyChallenge, dailySeed, weekIdOf, weekStart, ymdOf, type Challenge, type ChallengeLoadout, type ReplayWire, type RunEntry } from './protocol';
import { WEEKLIES } from './weeklies';

export { DAILY_WAVES, DAY_MS, LATE_MS, WEEK_MS, dailySeed, weekIdOf, weekStart, ymdOf };

// The challenge list (docs/design.md "Challenges"). A daily is a formula of its UTC day, so
// there is nothing to store or schedule: every server answers the same record for the same
// day. A weekly runs Monday 00:00 UTC to Monday with a fixed loadout, picked by hand in
// weeklies.ts or, for a week without one there, from a rotation by week.

/** The daily of the UTC day `ms` falls on (DAILY_WAVES: it ends as a win on wave 20's mid-boss, about 5 minutes). */
export function dailyOf(ms: number, engine = ENGINE_VERSION): Challenge {
  return dailyChallenge(ms, engine, MUTATOR_IDS);
}

/** The weekly's waves: one full chapter run. */
export const WEEKLY_WAVES = 50;

/** A week's loadout when weeklies.ts has none: relics, monks, left-out sutras and chapters cycling at different lengths. */
export function rotationLoadout(start: number): ChallengeLoadout {
  const i = Math.floor((start + 3 * DAY_MS) / WEEK_MS);
  const out = SUTRA_IDS[i % SUTRA_IDS.length];
  return {
    relic: RELIC_IDS[i % RELIC_IDS.length], monk: MONK_IDS[i % MONK_IDS.length],
    sutras: SUTRA_IDS.filter((s) => s !== out), chapter: 1 + (Math.floor(i / 2) % 5),
  };
}

/** The weekly of the week `ms` falls in: the hand-picked record if there is one (its mutator too), else the rotation's (none). */
export function weeklyOf(ms: number, engine = ENGINE_VERSION): Challenge {
  const start = weekStart(ms);
  const id = weekIdOf(start);
  const picked = WEEKLIES[id];
  const loadout = picked ? { relic: picked.relic, monk: picked.monk, sutras: [...picked.sutras], chapter: picked.chapter } : rotationLoadout(start);
  const seed = picked?.seed ?? dailySeed(0x40000000 + Number(id.slice(1, 5)) * 100 + Number(id.slice(6)));
  return { id, kind: 'weekly', start, end: start + WEEK_MS, seed, chapter: loadout.chapter, waves: WEEKLY_WAVES, mutator: picked?.mutator ?? null, loadout, engine };
}

/** The challenges open at `now`. */
export function openChallenges(now: number): Challenge[] {
  return [dailyOf(now), weeklyOf(now)];
}

/** The challenge `id` names, if a run may still be sent for it at `now` (open, or closed under LATE_MS ago). */
export function challengeFor(id: string, now: number): Challenge | null {
  if (!CHALLENGE_ID.test(id)) return null;
  const of = id.startsWith('w') ? weeklyOf : dailyOf;
  for (const c of [of(now), of(now - LATE_MS)]) if (c.id === id && now < c.end + LATE_MS) return c;
  return null;
}

/**
 * Why a run and its replay cannot be a run of `c`, or null when they can (the cheap checks
 * before any re-simulation): the engine version, the seed, the mutator, no revives, the challenge's
 * waves from the start (a win on its last), the run's own fields matching its config, and a weekly's loadout
 * whole: its relic, monk and sutras, and no gear or training.
 */
export function misfit(c: Challenge, run: RunEntry, replay: ReplayWire): string | null {
  const cfg = replay.config;
  if (replay.engine !== c.engine) return 'engine';
  if (cfg.seed !== c.seed) return 'seed';
  if ((cfg.mutator ?? null) !== c.mutator) return 'mutator';
  if (cfg.revives !== 0) return 'revives';
  if (cfg.waves !== c.waves || replay.wave !== 1 || (run.won && run.wave !== c.waves)) return 'waves';
  if (run.hard || cfg.hard !== false || cfg.firstRun === true) return 'mode';
  if (cfg.chapter !== run.chapter || (c.chapter !== 'furthest' && c.chapter !== run.chapter)) return 'chapter';
  if (cfg.relic !== run.relic || cfg.monk !== run.monk) return 'loadout';
  const l = c.loadout;
  if (l) {
    if (cfg.relic !== l.relic || cfg.monk !== l.monk) return 'loadout';
    const sutras = Array.isArray(cfg.sutras) ? cfg.sutras : [];
    if (sutras.length !== l.sutras.length || !l.sutras.every((s) => sutras.includes(s))) return 'loadout';
    const bonus = cfg.bonus && typeof cfg.bonus === 'object' ? Object.values(cfg.bonus) : [1];
    if (bonus.some((n) => n !== 0)) return 'loadout';
  }
  return null;
}
