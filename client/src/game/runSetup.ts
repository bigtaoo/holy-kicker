import { HERO_EASE_LOCKED, HERO_EASE_SMOOTH, type MonkId, type RelicId, type RunConfig, type StatBonus, type SutraId } from '@hk/engine';
import type { SceneOptions } from './scene';

// What a run is set up with, and the engine config it becomes.

/** What the shell sets a run up with: the chapter, hard mode and its length (0 for the sandbox), revives, the relic, the sutras and the stats from gear and training. */
export interface RunSetup {
  chapter: number;
  waves: number;
  revives: number;
  relic: RelicId;
  sutras: readonly SutraId[];
  bonus?: StatBonus;
  hard?: boolean;
  /** The monk played as (the kicker by default); his rig must be loaded (art.ts loadMonkArt). */
  monk?: MonkId;
}

/** The run a scene sets up: what the engine simulates. */
export function runConfig(scene: SceneOptions, seed: number, setup: RunSetup): RunConfig {
  return {
    seed, players: 1, mobs: scene.mobs, sep: scene.sep, queue: scene.queue,
    heroEase: scene.cam === 'lock' ? HERO_EASE_LOCKED : HERO_EASE_SMOOTH,
    elite: true, boss: scene.boss, threats: scene.threats, spells: scene.spells, spellRate: scene.rate, drops: scene.drops,
    waves: setup.waves, revives: setup.revives, relic: setup.relic, sutras: setup.sutras, chapter: setup.chapter,
    bonus: setup.bonus ?? {}, hard: setup.hard ?? false, monk: setup.monk ?? 'kicker',
  };
}

/** The setup a run's config was made from (a resumed run's, meta/resume.ts). */
export function setupOf(c: RunConfig): RunSetup {
  return { chapter: c.chapter, waves: c.waves, revives: c.revives, relic: c.relic, sutras: c.sutras, bonus: c.bonus, hard: c.hard, monk: c.monk };
}
