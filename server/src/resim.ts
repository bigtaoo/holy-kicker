import { DEFAULT_RUN, Engine, MONK_IDS, MUTATOR_IDS, RELIC_IDS, STATS, SUTRA_IDS, TICK_RATE, hashState, replayEngine, type RunConfig } from '@hk/engine';
import { LIMITS, type PickWire, type ReplayWire, type RunEntry } from './protocol';

// Re-simulating a challenge run (docs/design.md "Submitting and verifying a run"): the replay
// is stepped to its last tick on this server's engine, and the run counts only if it ends in
// the state the client hashed, with the outcome, wave and level the client claimed. Stepping
// also yields the pick timeline. A Resim steps in slices, so a queue (resimQueue.ts) can run it
// without holding the process for the seconds a long run takes.

export type Verdict = { ok: true; picks: PickWire[] } | { ok: false; why: string };

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/**
 * The replay's config as a RunConfig a ranked run could have had, or null: one hero, the
 * chapter's waves, no stress-test switches, a known mutator or none, and the player's own relic, monk, sutras
 * and stats from gear and training (whole numbers on known stats; the client is trusted on their size).
 */
export function rankedConfig(c: Record<string, unknown>): RunConfig | null {
  const d = DEFAULT_RUN;
  if (!isInt(c.seed, 1, 0x7fffffff) || c.players !== 1 || !isInt(c.waves, 1, LIMITS.waves) || !isInt(c.revives, 0, 0)) return null;
  if (c.mobs !== d.mobs || c.sep !== d.sep || c.queue !== d.queue || c.elite !== true || c.boss !== true || c.threats !== false) return null;
  if (c.heroEase !== 379 && c.heroEase !== 1000) return null;
  if (!Array.isArray(c.spells) || c.spells.length !== 0 || c.spellRate !== d.spellRate || c.drops !== 0) return null;
  if (!oneOf(c.relic, RELIC_IDS) || !oneOf(c.monk, MONK_IDS) || !isInt(c.chapter, 1, LIMITS.chapters) || c.hard !== false) return null;
  if (c.firstRun !== undefined && c.firstRun !== false) return null;
  const mutator = c.mutator ?? null;
  if (mutator !== null && !oneOf(mutator, MUTATOR_IDS)) return null;
  const sutras = c.sutras;
  if (!Array.isArray(sutras) || !sutras.every((s) => oneOf(s, SUTRA_IDS)) || new Set(sutras).size !== sutras.length) return null;
  const bonus = c.bonus;
  if (typeof bonus !== 'object' || bonus === null || Array.isArray(bonus)) return null;
  for (const [k, v] of Object.entries(bonus)) if (!oneOf(k, STATS) || !isInt(v, -1000, 10_000)) return null;
  return {
    seed: c.seed, players: 1, mobs: d.mobs, sep: d.sep, queue: d.queue, heroEase: c.heroEase, elite: true, boss: true, threats: false,
    spells: [], spellRate: d.spellRate, drops: 0, waves: c.waves, revives: 0, relic: c.relic, monk: c.monk, sutras, chapter: c.chapter,
    bonus: bonus as RunConfig['bonus'], hard: false, firstRun: false, mutator,
  };
}

const card = (c: { kind: string; id: string }) => `${c.kind}:${c.id}`;

export class Resim {
  readonly picks: PickWire[] = [];
  private readonly engine: Engine | null;
  private open: Omit<PickWire, 'took'> | null = null;

  constructor(private readonly replay: ReplayWire, private readonly run: RunEntry, private readonly engineVersion: number) {
    const config = rankedConfig(replay.config);
    this.engine = config ? replayEngine({ ...replay, config }) : null;
  }

  /** Steps at most `budget` ticks: the verdict once the replay's end is reached, else null. */
  step(budget: number): Verdict | null {
    const e = this.engine;
    if (!e) return { ok: false, why: 'config' };
    if (this.replay.engine !== this.engineVersion) return { ok: false, why: 'engine' };
    const s = e.state;
    const end = this.replay.tick;
    try {
      for (let n = 0; n < budget && s.tick < end; n++) {
        const p = s.players[0];
        if (p.offer.length > 0 && !this.open) this.open = { tick: s.tick, wave: s.wave, offered: p.offer.map(card) };
        for (const ev of e.advance() ?? []) {
          if (ev.type !== 'pick' || !this.open) continue;
          this.picks.push({ ...this.open, took: this.open.offered.indexOf(card(ev)) });
          this.open = null;
        }
      }
    } catch {
      return { ok: false, why: 'crash' };
    }
    return s.tick < end ? null : this.verdict();
  }

  private verdict(): Verdict {
    const s = this.engine!.state;
    const r = this.run;
    if (hashState(s) !== this.replay.hash) return { ok: false, why: 'hash' };
    if ((s.outcome === 'won') !== r.won || Math.max(1, s.wave) !== r.wave) return { ok: false, why: 'outcome' };
    if (s.players[0].level !== r.level || Math.round((s.tick * 10) / TICK_RATE) !== r.tenths) return { ok: false, why: 'stats' };
    return { ok: true, picks: this.picks };
  }
}

/** Re-simulates a run in one go (the tests; the queue steps a Resim in slices). */
export function resimulate(replay: ReplayWire, run: RunEntry, engineVersion: number): Verdict {
  const r = new Resim(replay, run, engineVersion);
  for (;;) {
    const v = r.step(10_000);
    if (v) return v;
  }
}
