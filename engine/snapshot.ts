import { Engine, ENGINE_VERSION } from './Engine';
import type { InputSource } from './input';
import { Prng } from './math/prng';
import type { SimState } from './state';

// A run frozen as plain data, so a player who left mid-run can go on where they were (the
// client keeps one across sessions). Unlike a replay (replay.ts), it does not have to play the
// run again from the first tick: the state is the run. The PRNG streams travel as their raw
// state and the derived gem lookup is rebuilt, so the restored engine steps on exactly as the
// one it was taken from would have (snapshot.test.ts).

/** SimState's PRNG streams, in the order Snapshot.rng holds them. */
const STREAMS = ['ai', 'combat', 'drop', 'spell', 'cards'] as const;

export interface Snapshot {
  /** ENGINE_VERSION it was taken with; another version may not read the state the same way. */
  engine: number;
  /** The state without its PRNG streams and derived lookups (gemCells), as JSON-safe data. */
  state: Record<string, unknown>;
  /** Each stream's raw state, in STREAMS order. */
  rng: number[];
}

/** A copy of `s` that shares nothing with it. */
export function takeSnapshot(s: SimState): Snapshot {
  const { gemCells: _cells, ai: _ai, combat: _combat, drop: _drop, spell: _spell, cards: _cards, ...data } = s;
  return {
    engine: ENGINE_VERSION,
    state: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
    rng: STREAMS.map((k) => s[k].peek()),
  };
}

/** The state `snap` was taken of, or null when another engine version took it. */
export function restoreState(snap: Snapshot): SimState | null {
  if (snap.engine !== ENGINE_VERSION || snap.rng?.length !== STREAMS.length) return null;
  const data = JSON.parse(JSON.stringify(snap.state)) as Omit<SimState, 'gemCells' | (typeof STREAMS)[number]>;
  const [ai, combat, drop, spell, cards] = snap.rng.map((r) => Prng.resume(r));
  const s: SimState = { ...data, gemCells: new Map(), ai, combat, drop, spell, cards };
  // every resting gem holds its merge cell; flying ones have left it
  for (const g of s.gems) if (!g.flying) s.gemCells.set(g.cell, g);
  return s;
}

/** An engine that goes on from `snap`, or null when another engine version took it. */
export function resumeEngine(snap: Snapshot, input?: InputSource): Engine | null {
  const s = restoreState(snap);
  return s ? new Engine(s.config, input, s) : null;
}
