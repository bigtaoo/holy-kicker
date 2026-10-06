import { restoreState, takeSnapshot, type SimState, type Snapshot } from '@hk/engine';
import type { KeyValueStore } from './saveStore';

// A chapter run the player left without finishing it (the game went to the background, the
// tab closed, the app was killed), kept so the next launch can offer to go on with it. It is
// the engine's snapshot (engine/snapshot.ts) plus what the shell counts beside the sim. It is
// written when the game goes to the background and at each wave start, and cleared as the run
// is settled; a game update that changes the engine version drops it.

export const RUN_KEY = 'hk.run';

export interface SavedRun {
  state: SimState;
  /** Free revives (training) the run had left. */
  freeRevives: number;
  /** Enemies defeated so far, for the daily tasks. */
  kills: number;
}

interface Stored {
  snap: Snapshot;
  freeRevives: number;
  kills: number;
}

export function keepRun(kv: KeyValueStore, run: SavedRun): void {
  const stored: Stored = { snap: takeSnapshot(run.state), freeRevives: run.freeRevives, kills: run.kills };
  kv.setItem(RUN_KEY, JSON.stringify(stored));
}

/** The kept run, or null: none, unreadable, or from another engine version. */
export function loadRun(kv: KeyValueStore): SavedRun | null {
  const text = kv.getItem(RUN_KEY);
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<Stored> | null;
    if (!raw?.snap) return null;
    const state = restoreState(raw.snap);
    // only a chapter run with its one hero is kept
    if (!state || !(state.config?.waves > 0) || state.players?.length !== 1 || !(state.wave >= 1)) return null;
    return { state, freeRevives: count(raw.freeRevives), kills: count(raw.kills) };
  } catch {
    return null;
  }
}

export function dropRun(kv: KeyValueStore): void {
  if (kv.getItem(RUN_KEY)) kv.setItem(RUN_KEY, '');
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : 0;
}
