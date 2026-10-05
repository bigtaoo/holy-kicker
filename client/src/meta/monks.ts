import { MONK_IDS, type MonkId } from '@hk/engine';
import { BALANCE } from './balance';
import type { SaveData } from './save';

// The monks (docs/content.md "Monks"): the kicker is everyone's from the start, the fat monk
// and the novice are bought once with jade (BALANCE.monks) in the lobby's monk panel; the one
// chosen plays every run (Shell passes it to the engine as RunConfig.monk).

export function ownsMonk(save: SaveData, id: MonkId): boolean {
  return (save.monks & (1 << MONK_IDS.indexOf(id))) !== 0;
}

export function monkPrice(id: MonkId): number {
  return BALANCE.monks[id];
}

/** Buys and picks monk `id`; null when it is owned already or the jade is short. */
export function buyMonk(save: SaveData, id: MonkId): SaveData | null {
  if (ownsMonk(save, id) || save.jade < monkPrice(id)) return null;
  return { ...save, jade: save.jade - monkPrice(id), monks: save.monks | (1 << MONK_IDS.indexOf(id)), monk: id };
}

/** Plays as an owned monk from the next run on. */
export function chooseMonk(save: SaveData, id: MonkId): SaveData {
  return ownsMonk(save, id) ? { ...save, monk: id } : save;
}

/** A monk not owned yet that the jade would buy: the lobby marks the monk button. */
export function monkAffordable(save: SaveData): boolean {
  return MONK_IDS.some((id) => !ownsMonk(save, id) && save.jade >= monkPrice(id));
}
