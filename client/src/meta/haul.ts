import { addDrops, type Drop } from './gear';
import type { SaveData } from './save';

/** What a chest or a patrol pays: copper, jade and gear. */
export interface Haul {
  copper: number;
  jade: number;
  drops: Drop[];
}

export function payHaul(save: SaveData, haul: Haul): SaveData {
  return { ...save, copper: save.copper + haul.copper, jade: save.jade + haul.jade, gear: addDrops(save.gear, haul.drops) };
}
