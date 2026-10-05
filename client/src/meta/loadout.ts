import { STATS, type Stat, type StatBonus } from '@hk/engine';
import { BALANCE } from './balance';
import { gearStats } from './gear';
import { atFrontier } from './progress';
import type { SaveData } from './save';
import { trainingStats } from './training';

// What the meta progression sends into a run (docs/design.md "Engine boundary"): the engine
// stats of the worn gear, the training line and, on the first uncleared chapter, the grit of
// the lost tries there summed into RunConfig.bonus, and training's free revives, which the
// shell offers before the rewarded-ad one.

export interface Loadout {
  bonus: StatBonus;
  freeRevives: number;
}

/** A run of chapter `chapter` (the lobby's by default) on the given track. */
export function loadout(save: SaveData, chapter = save.chapter, hard = save.hard): Loadout {
  const gear = gearStats(save);
  const trained = trainingStats(save);
  const grit = gritBonus(save, chapter, hard);
  const bonus: Partial<Record<Stat, number>> = {};
  for (const stat of STATS) {
    const n = (gear[stat] ?? 0) + (trained[stat] ?? 0) + (grit[stat] ?? 0);
    if (n) bonus[stat] = n;
  }
  return { bonus, freeRevives: trained.revive ?? 0 };
}

/** What the grit adds to a run of chapter `chapter`: only the first uncleared one of the climb has it. */
export function gritBonus(save: SaveData, chapter = save.chapter, hard = save.hard): Partial<Record<Stat, number>> {
  if (save.grit === 0 || !atFrontier(save, chapter, hard)) return {};
  const out: Partial<Record<Stat, number>> = {};
  for (const [stat, n] of Object.entries(BALANCE.grit.bonus) as [Stat, number][]) out[stat] = n * save.grit;
  return out;
}
