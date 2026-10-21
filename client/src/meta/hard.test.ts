import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { gritBonus } from './loadout';
import { bestChapter, chooseTrack, frontier, hardClears, hardOpenAt, playableChapters, runStars, selectChapter, settleRun, stage } from './progress';
import { newSave, parseSave, type SaveData } from './save';

const clean = { revived: false, lowest: 80 };

/** A save with chapters 1..n cleared on three stars, as those clears leave it. */
function cleared(n: number): SaveData {
  let save = newSave();
  for (let c = 1; c <= n; c++) save = settleRun({ ...save, hard: false, chapter: c }, { chapter: c, waves: BALANCE.waves, ...clean }, () => 0.5).save;
  return save;
}

describe('stars', () => {
  it('give one for the clear, two without a revive, three with the health kept over the line', () => {
    expect(runStars(false, false, 100)).toBe(0);
    expect(runStars(true, true, 100)).toBe(1);
    expect(runStars(true, false, BALANCE.stars.lowest - 1)).toBe(2);
    expect(runStars(true, false, BALANCE.stars.lowest)).toBe(3);
  });

  it('keep the best per chapter', () => {
    const one = settleRun(newSave(), { chapter: 1, waves: BALANCE.waves, revived: true, lowest: 0 });
    expect(one.reward).toMatchObject({ stars: 1, bestStars: 0, firstClear: true, hardUnlocked: false });
    expect(one.save.stars[0]).toBe(1);
    const lost = settleRun(one.save, { chapter: 1, waves: 10, ...clean });
    expect(lost.reward.stars).toBe(0);
    expect(lost.save.stars[0]).toBe(1);
    const three = settleRun(one.save, { chapter: 1, waves: BALANCE.waves, ...clean });
    expect(three.reward).toMatchObject({ stars: 3, bestStars: 1, firstClear: false, hardUnlocked: true });
    expect(three.save.stars[0]).toBe(3);
    expect(settleRun(three.save, { chapter: 1, waves: BALANCE.waves, revived: true }).save.stars[0]).toBe(3);
  });
});

describe('hard mode', () => {
  it('opens per chapter with its three stars', () => {
    const save = settleRun(newSave(), { chapter: 1, waves: BALANCE.waves, revived: false, lowest: 10 }).save;
    expect(save.stars[0]).toBe(2);
    expect(hardOpenAt(save, 1)).toBe(false);
    expect(chooseTrack({ ...save, chapter: 1 }, true)).toEqual({ ...save, chapter: 1 });
    const three = settleRun(save, { chapter: 1, waves: BALANCE.waves, ...clean }).save;
    expect(hardOpenAt(three, 1)).toBe(true);
    expect(hardOpenAt(three, 2)).toBe(false);
    expect(chooseTrack({ ...three, chapter: 1 }, true)).toMatchObject({ chapter: 1, hard: true });
  });

  it('keeps its own best waves, stars and chests, and moves the lobby nowhere', () => {
    const save = { ...cleared(2), chapter: 1, hard: true };
    const { save: next, reward } = settleRun(save, { chapter: 1, hard: true, waves: 30 });
    expect(next.hardBest[0]).toBe(30);
    expect(next.best[0]).toBe(BALANCE.waves);
    expect(reward.chests.map((c) => c.wave)).toEqual([10, 20, 30]);
    expect(next.chests).toEqual(save.chests);
    const won = settleRun(next, { chapter: 1, hard: true, waves: BALANCE.waves, ...clean });
    expect(won.reward).toMatchObject({ firstClear: true, hardUnlocked: false, stars: 3 });
    expect(won.save).toMatchObject({ chapter: 1, hard: true, cleared: 2 });
    expect(won.save.hardStars[0]).toBe(3);
    expect(won.save.stars[0]).toBe(3);
    expect(hardClears(won.save)).toBe(1);
    expect(bestChapter(won.save)).toBe(stage(1, true));
  });

  it('pays as the chapters BALANCE.hardStage on', () => {
    const save = cleared(1);
    expect(stage(1, true)).toBe(1 + BALANCE.hardStage);
    const normal = settleRun(save, { chapter: 1, waves: 20 }).reward.copper;
    const hard = settleRun(save, { chapter: 1, hard: true, waves: 20 }).reward.copper;
    expect(hard).toBeGreaterThan(normal);
  });

  it('gathers no grit: that stays with the first uncleared normal chapter', () => {
    const save = cleared(1);
    expect(frontier(save)).toBe(2);
    const lost = settleRun(save, { chapter: 1, hard: true, waves: 20 }).save;
    expect(lost.grit).toBe(0);
    const tried = settleRun(save, { chapter: 2, waves: 20 }).save;
    expect(tried.grit).toBe(1);
    expect(settleRun(tried, { chapter: 1, hard: true, waves: BALANCE.waves }).save.grit).toBe(1);
    expect(gritBonus(tried, 1, true)).toEqual({});
  });

  it('follows the shown chapter: another chapter keeps hard mode only where it is open', () => {
    const save = { ...cleared(2), chapter: 1, hard: true };
    expect(playableChapters(save)).toBe(3);
    expect(selectChapter(save, 2)).toMatchObject({ chapter: 2, hard: true });
    expect(selectChapter(save, 3)).toMatchObject({ chapter: 3, hard: false });
    expect(selectChapter(save, 4)).toBe(save);
  });
});

describe('save', () => {
  it('reads stars and hard mode back, only where the stars allow', () => {
    const save = { ...cleared(2), chapter: 2, hard: true };
    expect(parseSave(JSON.stringify(save))).toMatchObject({ chapter: 2, hard: true, stars: save.stars });
    const forged = parseSave(JSON.stringify({ ...save, stars: [3, 3, 3, 3], hardBest: [50, 50, 50, 50], hard: true, chapter: 3 }));
    expect(forged.stars.slice(0, 4)).toEqual([3, 3, 0, 0]);
    expect(forged.hardBest.slice(0, 4)).toEqual([50, 50, 0, 0]);
    expect(forged.hard).toBe(false);
  });

  it('turns a version 5 save into stars: one per clear, three on all five once hard mode was open', () => {
    const v5 = (o: object) => JSON.stringify({ ...newSave(), version: 5, stars: undefined, hardStars: undefined, ...o });
    const early = parseSave(v5({ cleared: 3, chapter: 2, hard: true, hardCleared: 2 }));
    expect(early.stars.slice(0, 5)).toEqual([1, 1, 1, 0, 0]);
    expect(early.hard).toBe(false);
    expect(hardClears(early)).toBe(0);
    const done = parseSave(v5({ cleared: 5, chapter: 2, hard: true, hardCleared: 2, hardBest: [50, 50, 12, 0, 0] }));
    expect(done.stars.slice(0, 6)).toEqual([3, 3, 3, 3, 3, 0]);
    expect(done.hardBest.slice(0, 5)).toEqual([50, 50, 12, 0, 0]);
    expect(done.hardStars.slice(0, 3)).toEqual([1, 1, 0]);
    expect(done).toMatchObject({ chapter: 2, hard: true });
  });
});
