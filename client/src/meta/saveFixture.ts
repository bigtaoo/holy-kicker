import { BALANCE } from './balance';
import { ACHIEVED_BITS, newSave } from './save';

// For the tests (saveStore.test.ts, platform/saveStores.test.ts); nothing in the game imports it.

// A save written by a newer build of the same version: more chapters, an item, an evolution, an
// achievement and a field this build does not know.
export function newerBuildSave(): Record<string, unknown> {
  const s = newSave() as unknown as Record<string, unknown>;
  const long = (v: number) => new Array<number>(BALANCE.chapters + 5).fill(v);
  // the goal after this build's last one claimed
  const goals = BALANCE.achievements.length;
  const achieved = new Array<number>(Math.floor(goals / ACHIEVED_BITS) + 1).fill(0);
  achieved[achieved.length - 1] = 2 ** (goals % ACHIEVED_BITS);
  return {
    ...s, firstRunDone: true, copper: 100, cleared: BALANCE.chapters + 2, chapter: BALANCE.chapters + 3,
    best: long(BALANCE.waves), stars: long(3), chests: long(2 ** (BALANCE.chests.length + 1) - 1),
    achieved, codex: ['someday-evolution'],
    gear: { ...(s.gear as object), hat: [1, 2] }, pets: { cat: 3 },
  };
}
