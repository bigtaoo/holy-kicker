import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { gritBonus, loadout } from './loadout';
import { settleRun } from './progress';
import { newSave, parseSave } from './save';

describe('grit', () => {
  it('a lost real try on the first uncleared chapter adds a stack', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: BALANCE.grit.minWaves });
    expect(save.grit).toBe(1);
    expect(reward.grit).toBe(1);
  });

  it('a short try or a replay of a cleared chapter adds none', () => {
    expect(settleRun(newSave(), { chapter: 1, waves: BALANCE.grit.minWaves - 1 }).save.grit).toBe(0);
    const cleared = settleRun(newSave(), { chapter: 1, waves: BALANCE.waves }).save;
    const replay = settleRun({ ...cleared, chapter: 1 }, { chapter: 1, waves: 20 });
    expect(replay.save.grit).toBe(0);
    expect(replay.reward.grit).toBe(0);
  });

  it('stops at the cap and starts over on the clear', () => {
    let save = { ...newSave(), grit: BALANCE.grit.max };
    save = settleRun(save, { chapter: 1, waves: 20 }).save;
    expect(save.grit).toBe(BALANCE.grit.max);
    expect(settleRun(save, { chapter: 1, waves: BALANCE.waves }).save.grit).toBe(0);
  });

  it('only strengthens runs of the first uncleared chapter', () => {
    const cleared = settleRun(newSave(), { chapter: 1, waves: BALANCE.waves }).save;
    const save = { ...cleared, grit: 3 };
    const attack = (BALANCE.grit.bonus.attack ?? 0) * 3;
    expect(gritBonus(save, 2).attack).toBe(attack);
    expect(gritBonus(save, 1)).toEqual({});
    expect((loadout(save, 2).bonus.attack ?? 0) - (loadout(save, 1).bonus.attack ?? 0)).toBe(attack);
  });

  it('survives a save round trip, clamped to the cap', () => {
    expect(parseSave(JSON.stringify({ ...newSave(), grit: 4 })).grit).toBe(4);
    expect(parseSave(JSON.stringify({ ...newSave(), grit: 999 })).grit).toBe(BALANCE.grit.max);
  });
});
