import type { SimState } from '@hk/engine';
import type { SceneOptions } from '../game/scene';
import { tenthsOf } from './clearTime';

// The pure parts of a run's start and end (runFlow.ts): which runs are kept for the next launch,
// and what an ended run counts for.

/** Whether a run is kept for resuming (meta/resume.ts): not the sandbox, an arena run, a dev bot's, a recording or a challenge. */
export function keepable(s: SimState, scene: Pick<SceneOptions, 'autoplay' | 'record'>, challenge: boolean): boolean {
  return s.config.waves > 0 && !s.config.arena && !scene.autoplay && !scene.record && !challenge;
}

/** The waves an ended run fully cleared: all of a won one, the ones before the wave it fell on otherwise. */
export function clearedWaves(s: SimState): number {
  return s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
}

/**
 * The wave a run of `last` waves reached after clearing `cleared`: the one it fell on, the last for a
 * clear. Every screen names a run by it (the HUD, the record banner, the results, the lobby, the
 * boards), while the save keeps the waves cleared.
 */
export function reachedWave(cleared: number, last: number): number {
  return last > 0 ? Math.min(cleared + 1, last) : cleared + 1;
}

/** An ended run as the backend counts it (run_end, the boards). */
export function runSummary(s: SimState, chapter: number, hard: boolean, kills: number) {
  const p = s.players[0];
  return {
    chapter, hard, won: s.outcome === 'won', wave: Math.max(1, s.wave), tenths: tenthsOf(s.tick),
    level: p.level, kills, monk: p.monk, relic: p.relicId,
  };
}
