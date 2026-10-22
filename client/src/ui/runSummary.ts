import { TICK_RATE, type SimState } from '@hk/engine';
import type { SceneOptions } from '../game/scene';

// The pure parts of a run's start and end (runFlow.ts): which runs are kept for the next launch,
// and what an ended run counts for.

/** Whether a run is kept for resuming (meta/resume.ts): not the sandbox, a dev bot's, a recording or a challenge. */
export function keepable(s: SimState, scene: Pick<SceneOptions, 'autoplay' | 'record'>, challenge: boolean): boolean {
  return s.config.waves > 0 && !scene.autoplay && !scene.record && !challenge;
}

/** The waves an ended run fully cleared: all of a won one, the ones before the wave it fell on otherwise. */
export function clearedWaves(s: SimState): number {
  return s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
}

/** An ended run as the backend counts it (run_end, the boards). */
export function runSummary(s: SimState, chapter: number, hard: boolean, kills: number) {
  const p = s.players[0];
  return {
    chapter, hard, won: s.outcome === 'won', wave: Math.max(1, s.wave), tenths: Math.round((s.tick * 10) / TICK_RATE),
    level: p.level, kills, monk: p.monk, relic: p.relicId,
  };
}
