import { STATS, type Stat, type StatBonus } from '@hk/engine';
import { gearStats } from './gear';
import type { SaveData } from './save';
import { trainingStats } from './training';

// What the meta progression sends into a run (docs/design.md "Engine boundary"): the engine
// stats of the worn gear and the training line summed into RunConfig.bonus, and training's
// free revives, which the shell offers before the rewarded-ad one.

export interface Loadout {
  bonus: StatBonus;
  freeRevives: number;
}

export function loadout(save: SaveData): Loadout {
  const gear = gearStats(save);
  const trained = trainingStats(save);
  const bonus: Partial<Record<Stat, number>> = {};
  for (const stat of STATS) {
    const n = (gear[stat] ?? 0) + (trained[stat] ?? 0);
    if (n) bonus[stat] = n;
  }
  return { bonus, freeRevives: trained.revive ?? 0 };
}
