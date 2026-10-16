import type { SimState } from '@hk/engine';
import type { SaveData } from './save';
import { track } from './progress';

// Where the player fell last time on each chapter (per track), for the HUD's marker on the next
// run, and what a run's death panel measures the fall against. Pure.

/** What a run knows of the chapter's past runs: best waves cleared, claimed chests (bits), last fall (0 for none). */
export interface RunPast {
  best: number;
  chests: number;
  fell: number;
}

export function runPast(save: SaveData, chapter: number, hard: boolean): RunPast {
  const t = track(save, hard);
  const i = chapter - 1;
  return { best: t.best[i] ?? 0, chests: t.chests[i] ?? 0, fell: (hard ? save.hardFell : save.fell)[i] ?? 0 };
}

/**
 * Keeps the wave a lost run fell on; a won run forgets the last fall, and a run given up while
 * still standing leaves it as it was.
 */
export function noteFall(save: SaveData, chapter: number, hard: boolean, run: Pick<SimState, 'outcome' | 'wave'>): SaveData {
  if (run.outcome === 'playing') return save;
  const wave = run.outcome === 'lost' ? Math.max(1, run.wave) : 0;
  const was = hard ? save.hardFell : save.fell;
  const fell = was.map((w, k) => (k === chapter - 1 ? wave : w));
  return hard ? { ...save, hardFell: fell } : { ...save, fell };
}
