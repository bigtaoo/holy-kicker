import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { newSave, type SaveData } from './save';
import { leaderOf, mergeSaves } from './saveMerge';

const at = (n: number, v: number) => {
  const a = new Array<number>(BALANCE.chapters).fill(0);
  a[n] = v;
  return a;
};

/** A phone that cleared chapter 2 and played a lot. */
function phone(): SaveData {
  return {
    ...newSave(), firstRunDone: true, level: 12, xp: 40, copper: 900, jade: 30, chapter: 3, cleared: 2, runs: 30, kills: 9000,
    best: [50, 50, 31, ...new Array<number>(BALANCE.chapters - 3).fill(0)], stars: [3, 2, ...new Array<number>(BALANCE.chapters - 2).fill(0)],
    chests: at(0, 7), opened: at(0, 3), trained: 9, codex: ['ball'], monks: 3, achieved: [5], seen: 7, gifts: 3, giftDay: 20261020,
    firstDay: 20261010, dice: 77, relic: 'staff', monk: 'fat',
  };
}

/** A browser that played a little, but further on one chapter and with things of its own. */
function browser(): SaveData {
  return {
    ...newSave(), firstRunDone: true, level: 12, xp: 90, copper: 50, jade: 2, chapter: 1, cleared: 1, runs: 8, kills: 800,
    best: [50, 45, ...new Array<number>(BALANCE.chapters - 2).fill(0)], stars: [3, ...new Array<number>(BALANCE.chapters - 1).fill(0)],
    chests: at(0, 8), opened: at(0, 8), trained: 3, codex: ['fish'], monks: 5, achieved: [8], seen: 9, gifts: 2, giftDay: 20261021,
    firstDay: 20261008, dice: 0,
  };
}

const PROGRESS = ['cleared', 'runs', 'kills', 'trained'] as const;
const PER_CHAPTER = ['best', 'stars', 'hardBest', 'hardStars'] as const;

describe('mergeSaves', () => {
  it('takes the furthest progress of both', () => {
    const m = mergeSaves(browser(), phone());
    expect(m).toMatchObject({ cleared: 2, runs: 30, kills: 9000, trained: 9, level: 12, xp: 90, firstDay: 20261008, gifts: 3, giftDay: 20261020 });
    expect(m.best.slice(0, 3)).toEqual([50, 50, 31]);
    expect(m.chests[0]).toBe(15);
    expect(m.opened[0]).toBe(11);
    expect(m.codex).toEqual(expect.arrayContaining(['ball', 'fish']));
    expect([m.monks, m.achieved, m.seen]).toEqual([7, [13], 15]);
  });

  it('takes the wallet and the selections from the save that played more', () => {
    for (const m of [mergeSaves(browser(), phone()), mergeSaves(phone(), browser())]) {
      expect(m).toMatchObject({ copper: 900, jade: 30, chapter: 3, relic: 'staff', monk: 'fat', dice: 77 });
    }
    expect(leaderOf(phone(), browser())).toBe('mine');
    // a tie keeps this device's
    expect(leaderOf({ ...phone(), copper: 1 }, phone())).toBe('mine');
    expect(mergeSaves({ ...phone(), copper: 1 }, phone()).copper).toBe(1);
  });

  it('is the same both ways on progress, and never lowers any of it', () => {
    const a = mergeSaves(browser(), phone());
    const b = mergeSaves(phone(), browser());
    for (const k of PROGRESS) expect(a[k]).toBe(b[k]);
    for (const k of PER_CHAPTER) expect(a[k]).toEqual(b[k]);
    for (const s of [browser(), phone()]) {
      for (const k of PROGRESS) expect(a[k]).toBeGreaterThanOrEqual(s[k]);
      for (const k of PER_CHAPTER) a[k].forEach((v, i) => expect(v).toBeGreaterThanOrEqual(s[k][i]));
      for (const k of ['monks', 'seen'] as const) expect(a[k] & s[k]).toBe(s[k]);
      s.achieved.forEach((w, i) => expect(a.achieved[i]! & w).toBe(w));
    }
  });

  it('takes the streak of the last daily played and the best daily of the later day', () => {
    const played = (streak: number, streakDay: number, bestStreak: number, id: string, waves: number): SaveData =>
      ({ ...phone(), streak, streakDay, bestStreak, dailyBest: { id, waves } });
    const a = played(5, 20261021, 5, 'd20261021', 14);
    const b = { ...played(2, 20261022, 9, 'd20261022', 6), runs: 1 };
    for (const m of [mergeSaves(a, b), mergeSaves(b, a)]) {
      expect(m).toMatchObject({ streak: 2, streakDay: 20261022, bestStreak: 9, dailyBest: { id: 'd20261022', waves: 6 } });
    }
    // the same day: the longer streak and the more waves
    const c = played(4, 20261022, 4, 'd20261022', 11);
    for (const m of [mergeSaves(b, c), mergeSaves(c, b)]) expect(m).toMatchObject({ streak: 4, bestStreak: 9, dailyBest: { waves: 11 } });
  });

  it('gives the relics the merged clears unlock, and merging twice changes nothing', () => {
    const m = mergeSaves({ ...browser(), runs: 99 }, phone());
    expect(m.cleared).toBe(2);
    expect(m.gear.staff.some((n) => n > 0)).toBe(true);
    expect(mergeSaves(m, phone())).toEqual(m);
    expect(mergeSaves(m, m)).toEqual(m);
  });

  it("keeps every experiment arm either save was put in, the leader's first, and the tester mark", () => {
    const lead = { ...phone(), arms: { first20: 'short' } };
    const trail = { ...browser(), arms: { first20: 'control', other: '' }, tester: true };
    for (const m of [mergeSaves(lead, trail), mergeSaves(trail, lead)]) {
      expect(m.arms).toEqual({ first20: leaderOf(lead, trail) === 'mine' ? 'short' : 'control', other: '' });
      expect(m.tester).toBe(true);
    }
  });

  it('keeps the fields this build does not know from the leading save', () => {
    const lead = { ...phone(), later: 'kept' } as SaveData;
    expect((mergeSaves(browser(), lead) as unknown as Record<string, unknown>).later).toBeUndefined();
    // readSave drops it from the game's copy; the stores keep it (saveKeep.ts), see cloudSync
  });
});
