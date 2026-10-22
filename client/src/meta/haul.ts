import { MONK_IDS, type MonkId } from '@hk/engine';
import { addDrops, type Drop } from './gear';
import type { SaveData } from './save';

/** What a chest or a patrol pays: copper, jade and gear (and a welcome gift a monk). */
export interface Haul {
  copper: number;
  jade: number;
  drops: Drop[];
  monk?: MonkId;
}

export function payHaul(save: SaveData, haul: Haul): SaveData {
  const monks = haul.monk ? save.monks | (1 << MONK_IDS.indexOf(haul.monk)) : save.monks;
  return { ...save, copper: save.copper + haul.copper, jade: save.jade + haul.jade, gear: addDrops(save.gear, haul.drops), monks };
}
