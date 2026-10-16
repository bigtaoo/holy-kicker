import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { chapterMul, settleRun } from './progress';
import { anyChestWaiting, chestsWaiting, openProgressChest } from './progressChests';
import { newSave, parseSave } from './save';

describe('progress chests', () => {
  it('waits in the lobby instead of paying at the results', () => {
    const { save } = settleRun(newSave(), { chapter: 1, waves: 25 });
    expect(save.copper).toBe(250);
    expect(save.jade).toBe(0);
    expect(chestsWaiting(save, 1, false)).toBe(0b11);
    expect(anyChestWaiting(save)).toBe(true);
  });

  it('opens each waiting chest once and pays it', () => {
    const { save } = settleRun(newSave(), { chapter: 3, waves: 15 });
    const r = openProgressChest(save, 3, false, 0);
    expect(r?.haul.copper).toBe(Math.round(BALANCE.chests[0].copper * chapterMul(3)));
    expect(r?.save.copper).toBe(save.copper + (r?.haul.copper ?? 0));
    expect(r?.save.jade).toBe(BALANCE.chests[0].jade);
    expect(r && anyChestWaiting(r.save)).toBe(false);
    expect(r && openProgressChest(r.save, 3, false, 0)).toBeNull();
    expect(openProgressChest(save, 3, false, 1)).toBeNull();
  });

  it('keeps hard mode apart', () => {
    const save = { ...newSave(), hardChests: [1, 0, 0, 0, 0] };
    expect(chestsWaiting(save, 1, false)).toBe(0);
    expect(openProgressChest(save, 1, true, 0)?.save.hardOpened[0]).toBe(1);
  });

  it('treats every reached chest of an older save as opened', () => {
    const old = parseSave(JSON.stringify({ ...newSave(), chests: [3, 1, 0, 0, 0], opened: undefined }));
    expect(old.opened).toEqual([3, 1, 0, 0, 0]);
    expect(anyChestWaiting(old)).toBe(false);
  });
});
