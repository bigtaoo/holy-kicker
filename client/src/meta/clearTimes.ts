import type { SaveData } from './save';

// The fastest won run per chapter and track, in tenths of a simulated second (the boards' measure:
// pauses, cards and ads do not count), for the results' comparison and the in-run timer. Pure.

/** The chapter's best clear time on the track, 0 for none yet. */
export function bestTime(save: SaveData, chapter: number, hard: boolean): number {
  return (hard ? save.hardTimes : save.times)[chapter - 1] ?? 0;
}

/** Keeps `tenths` as the chapter's best clear time when it is the first or a faster one. */
export function noteTime(save: SaveData, chapter: number, hard: boolean, tenths: number): SaveData {
  const was = bestTime(save, chapter, hard);
  if (tenths <= 0 || (was > 0 && was <= tenths)) return save;
  const times = (hard ? save.hardTimes : save.times).map((v, k) => (k === chapter - 1 ? Math.floor(tenths) : v));
  return hard ? { ...save, hardTimes: times } : { ...save, times };
}
