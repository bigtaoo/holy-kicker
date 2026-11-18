import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { runWaves, settleRun } from './progress';
import { newSave } from './save';

// The first run ends on the first mid-boss (docs/retention.md "A shorter first run"): a first win
// that pays its waves and chests and opens the lobby, but is no clear; the next run is the chapter.

const SHORT = BALANCE.firstRun.waves;

describe('the short first run', () => {
  it('is the first run of chapter 1 only', () => {
    expect(SHORT).toBeLessThan(BALANCE.waves);
    expect(runWaves(newSave(), 1, false)).toBe(SHORT);
    expect(runWaves(newSave(), 1, true)).toBe(BALANCE.waves);
    expect(runWaves(newSave(), 2, false)).toBe(BALANCE.waves);
    expect(runWaves({ ...newSave(), firstRunDone: true }, 1, false)).toBe(BALANCE.waves);
  });

  it('won: paid and its chests reached, no clear, stars or grit, and the full chapter next', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: SHORT, length: SHORT }, () => 0.5);
    expect(reward).toMatchObject({ intro: true, firstClear: false, stars: 0, grit: 0, newcomer: true, newBest: true });
    expect(reward.copper).toBeGreaterThan(0);
    expect(reward.chests.map((c) => c.wave)).toEqual(BALANCE.chests.filter((c) => c.wave <= SHORT).map((c) => c.wave));
    expect(save).toMatchObject({ firstRunDone: true, cleared: 0, chapter: 1, grit: 0, runs: 1 });
    expect(save.best[0]).toBe(SHORT);
    expect(save.stars[0]).toBe(0);
    expect(runWaves(save, 1, false)).toBe(BALANCE.waves);
  });

  it('lost before its end: a lost run like any other, grit included', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 12, length: SHORT }, () => 0.5);
    expect(reward).toMatchObject({ intro: false, firstClear: false, stars: 0, grit: 1 });
    expect(save.grit).toBe(1);
  });

  it('leaves the full chapter as it was', () => {
    const won = settleRun({ ...newSave(), firstRunDone: true }, { chapter: 1, waves: BALANCE.waves, length: BALANCE.waves }, () => 0.5);
    expect(won.reward).toMatchObject({ intro: false, firstClear: true });
    const lost = settleRun({ ...newSave(), firstRunDone: true }, { chapter: 1, waves: SHORT }, () => 0.5);
    expect(lost.reward).toMatchObject({ intro: false, firstClear: false, grit: 1 });
  });
});
