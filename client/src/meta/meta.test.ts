import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { doubleCopper, earnedSutras, seeTab, settleRun, tabLock, tabNew, unlockedRelics, xpToNext, type Reward } from './progress';
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
    expect((s.best).slice(0, 5)).toEqual([50, 12, 0, 0, 0]);
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

  it('adds the won offerings to the copper', () => {
    const { reward } = settleRun(newSave(), { chapter: 1, waves: 20, offerings: 2 });
    expect(reward.offering).toBe(Math.round((200 * BALANCE.offeringPercent * 2) / 100));
    expect(reward.copper).toBe(200 + reward.offering);
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

  it('a first clear unlocks the next chapter', () => {
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 50 });
    expect(reward.firstClear).toBe(true);
    expect(save.cleared).toBe(1);
    expect(save.chapter).toBe(2);
    expect(tabLock(save, 'codex')).toEqual({ kind: 'chapter', n: 2 });
    const replay = settleRun({ ...save, chapter: 1 }, { chapter: 1, waves: 50 });
    expect(replay.reward.firstClear).toBe(false);
    expect(replay.save.chapter).toBe(1);
  });

  it('marks a tab newly open until it is seen; an old save has seen them all', () => {
    const { save } = settleRun(newSave(), { chapter: 1, waves: 50 });
    expect(tabNew(save, 'shop')).toBe(true);
    expect(tabNew(save, 'play')).toBe(false);
    expect(tabNew(save, 'codex')).toBe(false);
    const seen = seeTab(save, 'shop');
    expect(tabNew(seen, 'shop')).toBe(false);
    expect(seeTab(seen, 'shop')).toBe(seen);
    const old = JSON.parse(JSON.stringify(save));
    delete old.seen;
    expect(tabNew(parseSave(JSON.stringify(old)), 'shop')).toBe(false);
  });

  it('unlocks the staff with the first clear, and the save keeps only an unlocked relic', () => {
    const relics = (r: Reward) => r.unlocks.flatMap((u) => (u.kind === 'relic' ? [u.id] : []));
    expect(unlockedRelics(newSave())).toEqual(['ball']);
    const { save, reward } = settleRun(newSave(), { chapter: 1, waves: 50 });
    expect(relics(reward)).toEqual(['staff']);
    expect(unlockedRelics(save)).toEqual(['ball', 'staff']);
    expect(relics(settleRun(save, { chapter: 1, waves: 50 }).reward)).toEqual([]);
    expect(parseSave(JSON.stringify({ ...save, relic: 'staff' })).relic).toBe('staff');
    expect(parseSave(JSON.stringify({ relic: 'staff' })).relic).toBe('ball');
    expect(parseSave(JSON.stringify({ cleared: 1, relic: 'sword' })).relic).toBe('ball');
    // the second clear brings none, the third the wooden fish (docs/unlocks.md)
    const second = settleRun(save, { chapter: 2, waves: 50 });
    expect(relics(second.reward)).toEqual([]);
    expect(parseSave(JSON.stringify({ ...second.save, relic: 'fish' })).relic).toBe('ball');
    const third = settleRun(second.save, { chapter: 3, waves: 50 });
    expect(relics(third.reward)).toEqual(['fish']);
    expect(unlockedRelics(third.save)).toEqual(['ball', 'staff', 'fish']);
    expect(parseSave(JSON.stringify({ ...third.save, relic: 'fish' })).relic).toBe('fish');
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

  it('grants each sutra at its achievement, and keeps it', () => {
    const sutras = (r: Reward) => r.unlocks.flatMap((u) => (u.kind === 'sutra' ? [u.id] : []));
    let save = newSave();
    expect(earnedSutras(save)).toEqual([]);
    let run = settleRun(save, { chapter: 1, waves: 25 });
    expect(sutras(run.reward)).toEqual(['lotus']);
    save = { ...run.save, runs: 9, cleared: 1 };
    run = settleRun(save, { chapter: 2, waves: 50 });
    // the tenth run and the chapter 2 clear at once
    expect(sutras(run.reward)).toEqual(['roar', 'focus']);
    run = settleRun({ ...run.save, cleared: 10, chapter: 11 }, { chapter: 11, waves: 50 });
    expect(sutras(run.reward)).toEqual(['halo']);
    expect(earnedSutras(run.save)).toEqual(['lotus', 'halo', 'roar', 'focus']);
    expect(sutras(settleRun(run.save, { chapter: 1, waves: 30 }).reward)).toEqual([]);
    // stored: a save whose progress no longer reaches a goal keeps the sutra
    expect(earnedSutras({ ...run.save, cleared: 0, best: run.save.best.map(() => 0), runs: 0 })).toEqual(['lotus', 'halo', 'roar', 'focus']);
  });

  it('gates tabs as the design says', () => {
    const s = newSave();
    expect(tabLock(s, 'play')).toBeNull();
    // open from the start, so App Review finds the iOS ad-free card without clearing a chapter
    expect(tabLock(s, 'shop')).toBeNull();
    expect(tabLock(s, 'gear')).toEqual({ kind: 'firstRun' });
    // training opens with the first run, its first node bought with that run's copper
    expect(tabLock(s, 'train')).toEqual({ kind: 'firstRun' });
    expect(tabLock({ ...s, firstRunDone: true }, 'train')).toBeNull();
  });
});
