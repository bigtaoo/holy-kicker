import { describe, expect, it } from 'vitest';
import { noteFall, runPast } from './falls';
import { newSave, parseSave } from './save';

describe('last falls', () => {
  it('reads an older save without them as none fallen', () => {
    const old = { ...newSave(), version: 5 } as Record<string, unknown>;
    delete old.fell;
    delete old.hardFell;
    const save = parseSave(JSON.stringify(old));
    expect((save.fell).slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect((save.hardFell).slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(runPast(save, 2, false).fell).toBe(0);
  });

  it('keeps a lost run wave per chapter and track, through a save round trip', () => {
    let save = noteFall(newSave(), 2, false, { outcome: 'lost', wave: 17 });
    save = noteFall(save, 1, true, { outcome: 'lost', wave: 9 });
    save = parseSave(JSON.stringify(save));
    expect((save.fell).slice(0, 5)).toEqual([0, 17, 0, 0, 0]);
    expect((save.hardFell).slice(0, 5)).toEqual([9, 0, 0, 0, 0]);
    expect(runPast(save, 2, false)).toEqual({ best: 0, chests: 0, fell: 17 });
  });

  it('forgets the fall on a win and keeps it on a give-up while standing', () => {
    const fell = noteFall(newSave(), 1, false, { outcome: 'lost', wave: 12 });
    expect(noteFall(fell, 1, false, { outcome: 'playing', wave: 20 })).toBe(fell);
    expect(noteFall(fell, 1, false, { outcome: 'won', wave: 50 }).fell[0]).toBe(0);
  });

  it('clamps a broken stored value', () => {
    expect((parseSave(JSON.stringify({ ...newSave(), fell: [999, -3, 'x'] })).fell).slice(0, 5)).toEqual([50, 0, 0, 0, 0]);
  });
});
