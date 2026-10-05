import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { gritBonus } from './loadout';
import { chooseTrack, frontier, hardOpen, playableChapters, settleRun, stage } from './progress';
import { newSave, parseSave, type SaveData } from './save';

/** A save with every normal chapter cleared, as the last clear leaves it. */
function allCleared(): SaveData {
  let save = newSave();
  for (let c = 1; c <= BALANCE.chapters; c++) save = settleRun({ ...save, hard: false, chapter: c }, { chapter: c, waves: BALANCE.waves }, () => 0.5).save;
  return save;
}

describe('hard mode', () => {
  it('opens with the last chapter cleared and moves the lobby to hard chapter 1', () => {
    let save = newSave();
    for (let c = 1; c < BALANCE.chapters; c++) save = settleRun(save, { chapter: c, waves: BALANCE.waves }).save;
    expect(hardOpen(save)).toBe(false);
    expect(chooseTrack(save, true)).toBe(save);
    const { save: done, reward } = settleRun(save, { chapter: BALANCE.chapters, waves: BALANCE.waves });
    expect(reward.hardUnlocked).toBe(true);
    expect(done.hard).toBe(true);
    expect(done.chapter).toBe(1);
    expect(frontier(done)).toEqual({ chapter: 1, hard: true });
  });

  it('keeps its own clears, best waves and chests', () => {
    const save = allCleared();
    const { save: next, reward } = settleRun(save, { chapter: 1, hard: true, waves: 30 });
    expect(next.hardBest[0]).toBe(30);
    expect(next.best[0]).toBe(BALANCE.waves);
    expect(reward.chests.map((c) => c.wave)).toEqual([10, 20, 30]);
    expect(next.chests).toEqual(save.chests);
    expect(next.hardCleared).toBe(0);
    const won = settleRun(next, { chapter: 1, hard: true, waves: BALANCE.waves });
    expect(won.reward.firstClear).toBe(true);
    expect(won.reward.hardUnlocked).toBe(false);
    expect(won.save.hardCleared).toBe(1);
    expect(won.save.cleared).toBe(BALANCE.chapters);
    expect(playableChapters(won.save)).toBe(2);
  });

  it('pays as the stages after chapter 5', () => {
    const save = allCleared();
    expect(stage(1, true)).toBe(BALANCE.chapters + 1);
    const normal = settleRun(save, { chapter: 1, waves: 20 }).reward.copper;
    const hard = settleRun(save, { chapter: 1, hard: true, waves: 20 }).reward.copper;
    expect(hard).toBeGreaterThan(normal * 3);
  });

  it('gathers grit on the first uncleared hard chapter only', () => {
    const save = allCleared();
    expect(save.grit).toBe(0);
    const lost = settleRun(save, { chapter: 1, hard: true, waves: 20 }).save;
    expect(lost.grit).toBe(1);
    expect(settleRun(save, { chapter: 1, waves: 20 }).save.grit).toBe(0);
    expect(Object.keys(gritBonus(lost, 1, true)).length).toBeGreaterThan(0);
    expect(gritBonus(lost, 1, false)).toEqual({});
  });

  it('switches tracks on the first uncleared chapter of each', () => {
    const save = { ...allCleared(), hardCleared: 2 };
    expect(chooseTrack(save, true).chapter).toBe(3);
    expect(chooseTrack(save, false).chapter).toBe(BALANCE.chapters);
  });

  it('reads back from a save, never before chapter 5 is cleared', () => {
    const save = { ...allCleared(), hardCleared: 2, chapter: 3, hard: true };
    const back = parseSave(JSON.stringify(save));
    expect(back.hard).toBe(true);
    expect(back.hardCleared).toBe(2);
    expect(back.chapter).toBe(3);
    const early = parseSave(JSON.stringify({ ...newSave(), cleared: 3, hard: true, hardCleared: 4 }));
    expect(early.hard).toBe(false);
    expect(early.hardCleared).toBe(0);
  });
});
