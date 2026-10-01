import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { doubleCopper, settleRun, tabLock, xpToNext } from './progress';
import { newSave, parseSave } from './save';
import { MemoryStore, SafeStore, SaveStore } from './saveStore';

describe('save', () => {
  it('turns nothing or garbage into a new save', () => {
    expect(parseSave(null)).toEqual(newSave());
    expect(parseSave('{oops')).toEqual(newSave());
    expect(parseSave('42')).toEqual(newSave());
  });

  it('keeps good fields and repairs bad ones', () => {
    const s = parseSave(JSON.stringify({ copper: 500, jade: -3, level: 'x', cleared: 2, chapter: 9, best: [50, 12] }));
    expect(s.copper).toBe(500);
    expect(s.jade).toBe(0);
    expect(s.level).toBe(1);
    expect(s.chapter).toBe(3);
    expect(s.best).toEqual([50, 12, 0, 0, 0]);
  });

  it('round-trips through the store, and survives a store that throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    for (const kv of [new MemoryStore(), new SafeStore(broken)]) {
      const store = new SaveStore(kv);
      const s = { ...newSave(), copper: 77 };
      store.save(s);
      expect(store.load()).toEqual(s);
    }
  });
});

describe('progress', () => {
  it('pays every run, even a short one', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 3 });
    expect(reward.copper).toBe(30);
    expect(reward.chests).toEqual([]);
    expect(save.copper).toBe(30);
    expect(save.firstRunDone).toBe(true);
    expect(save.best[0]).toBe(3);
  });

  it('opens each progress chest once', () => {
    const first = settleRun(newSave(), { chapter: 1, waves: 25 });
    expect(first.reward.chests.map((c) => c.wave)).toEqual([10, 20]);
    const again = settleRun(first.save, { chapter: 1, waves: 25 });
    expect(again.reward.chests).toEqual([]);
    expect(again.reward.newBest).toBe(false);
  });

  it('scales copper with the chapter: a full clear pays 500 / 1000 / 1500', () => {
    for (const [chapter, copper] of [[1, 500], [3, 1000], [5, 1500]]) {
      expect(settleRun(newSave(), { chapter, waves: BALANCE.waves }).reward.copper).toBe(copper);
    }
  });

  it('a first clear unlocks the next chapter and the shop', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 50 });
    expect(reward.firstClear).toBe(true);
    expect(save.cleared).toBe(1);
    expect(save.chapter).toBe(2);
    expect(tabLock(save, 'shop')).toBeNull();
    expect(tabLock(save, 'codex')).toEqual({ kind: 'chapter', n: 2 });
    const replay = settleRun({ ...save, chapter: 1 }, { chapter: 1, waves: 50 });
    expect(replay.reward.firstClear).toBe(false);
    expect(replay.save.chapter).toBe(1);
  });

  it('levels up from wave xp, carrying the remainder', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 50 });
    let xp = 50 * BALANCE.xpPerWave;
    let level = 1;
    while (xp >= xpToNext(level)) xp -= xpToNext(level++);
    expect(save.level).toBe(level);
    expect(save.xp).toBe(xp);
    expect(reward.levelsGained).toBe(level - 1);
  });

  it('the ad doubles only the wave copper', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 10 });
    expect(doubleCopper(save, reward).copper).toBe(save.copper + 100);
  });

  it('gates tabs as the design says', () => {
    const s = newSave();
    expect(tabLock(s, 'play')).toBeNull();
    expect(tabLock(s, 'gear')).toEqual({ kind: 'firstRun' });
    expect(tabLock(s, 'train')).toEqual({ kind: 'level', level: 2 });
    expect(tabLock({ ...s, level: 2 }, 'train')).toBeNull();
  });
});
