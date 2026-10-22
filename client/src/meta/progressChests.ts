import { BALANCE } from './balance';
import type { Haul } from './haul';
import { chestPay, stage } from './progress';
import type { SaveData } from './save';

// The progress chests on each chapter's waves 10..50. A run that reaches one only unlocks it
// (settleRun); the player opens it in the lobby, on the chapter card, so the results screen stays
// short and the lobby has something to tap on the way back in.

const key = (hard: boolean) => (hard ? 'hardOpened' : 'opened') as 'hardOpened' | 'opened';

/** The chests of `chapter` reached but not yet opened, one bit per chest. */
export function chestsWaiting(save: SaveData, chapter: number, hard: boolean): number {
  const reached = (hard ? save.hardChests : save.chests)[chapter - 1] ?? 0;
  return reached & ~(save[key(hard)][chapter - 1] ?? 0);
}

/** How many chests wait, over every chapter of both tracks. */
export function chestsWaitingCount(save: SaveData): number {
  let count = 0;
  for (let n = 1; n <= BALANCE.chapters; n++) {
    for (let bits = chestsWaiting(save, n, false) | (chestsWaiting(save, n, true) << 16); bits; bits &= bits - 1) count++;
  }
  return count;
}

/** Whether any chapter of either track has a chest waiting. */
export function anyChestWaiting(save: SaveData): boolean {
  return chestsWaitingCount(save) > 0;
}

/** Opens a waiting chest and pays it, or null when it is not waiting. */
export function openProgressChest(save: SaveData, chapter: number, hard: boolean, index: number): { save: SaveData; haul: Haul } | null {
  const bit = 1 << index;
  if (!(chestsWaiting(save, chapter, hard) & bit)) return null;
  const pay = chestPay(stage(chapter, hard), index);
  const k = key(hard);
  const opened = save[k].map((o, i) => (i === chapter - 1 ? o | bit : o));
  return {
    save: { ...save, [k]: opened, copper: save.copper + pay.copper, jade: save.jade + pay.jade },
    haul: { copper: pay.copper, jade: pay.jade, drops: [] },
  };
}
