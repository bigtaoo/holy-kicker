import { describe, expect, it } from 'vitest';
import { bestTime, noteTime } from './clearTimes';
import { mergeSaves } from './saveMerge';
import { newSave, parseSave } from './save';

describe('clear times', () => {
  it('reads a save without them as none timed', () => {
    const old = { ...newSave() } as Record<string, unknown>;
    delete old.times;
    delete old.hardTimes;
    const save = parseSave(JSON.stringify(old));
    expect(bestTime(save, 1, false)).toBe(0);
    expect(bestTime(save, 1, true)).toBe(0);
  });

  it('keeps the first and every faster time, per track', () => {
    let save = noteTime(newSave(), 3, false, 2461);
    expect(bestTime(save, 3, false)).toBe(2461);
    expect(noteTime(save, 3, false, 2500)).toBe(save);
    save = noteTime(save, 3, false, 2380);
    expect(bestTime(save, 3, false)).toBe(2380);
    save = noteTime(save, 3, true, 3000);
    expect([bestTime(save, 3, false), bestTime(save, 3, true)]).toEqual([2380, 3000]);
    expect(parseSave(JSON.stringify(save)).times[2]).toBe(2380);
  });

  it('merges two saves to the faster time, none losing to any', () => {
    const a = noteTime(noteTime(newSave(), 1, false, 2000), 2, false, 3000);
    const b = noteTime(newSave(), 1, false, 1900);
    const m = mergeSaves(a, b);
    expect(m.times.slice(0, 2)).toEqual([1900, 3000]);
  });
});
