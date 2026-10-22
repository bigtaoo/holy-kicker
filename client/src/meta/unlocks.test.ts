import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { loadout } from './loadout';
import { settleRun } from './progress';
import { newSave, parseSave, type SaveData } from './save';
import { blessingBonus, clearUnlocks, earnedSutras, monkOpen, newUnlocks, nextBlessing, starTotal, tierChapter, unlockedRelics } from './unlocks';

/** A save as stored before the re-paced unlocks: no `sutras` field. */
function legacy(save: Partial<SaveData>): string {
  const raw: Record<string, unknown> = { ...newSave(), version: 6, ...save };
  delete raw.sutras;
  return JSON.stringify(raw);
}

function withStars(n: number): SaveData {
  const stars = new Array<number>(BALANCE.chapters).fill(0);
  for (let i = 0; i < n; i++) stars[Math.floor(i / 3)]++;
  return { ...newSave(), cleared: Math.ceil(n / 3), stars };
}

describe('unlocks', () => {
  it('spreads the relics over the acts', () => {
    const at = (cleared: number) => unlockedRelics({ ...newSave(), cleared });
    expect(at(0)).toEqual(['ball']);
    expect(at(2)).toEqual(['ball', 'staff']);
    expect(at(3)).toEqual(['ball', 'staff', 'fish']);
    expect(at(14)).toEqual(['ball', 'staff', 'fish', 'beads']);
    expect(at(15)).toEqual(['ball', 'staff', 'fish', 'beads', 'bowl']);
  });

  it('keeps what an old save had unlocked under the old gates', () => {
    // chapter 4 cleared under the old schedule: all five relics, worn the bowl, Halo from the Codex
    const save = parseSave(legacy({ cleared: 4, relic: 'bowl', codex: ['palm'], best: [50, 50, 50, 50, ...new Array(16).fill(0)] }));
    expect(unlockedRelics(save)).toEqual(['ball', 'staff', 'fish', 'beads', 'bowl']);
    expect(save.relic).toBe('bowl');
    expect(earnedSutras(save)).toEqual(['lotus', 'halo', 'roar']);
    // read back again (now with stored sutras), nothing is lost
    const again = parseSave(JSON.stringify(save));
    expect(unlockedRelics(again)).toEqual(unlockedRelics(save));
    expect(earnedSutras(again)).toEqual(earnedSutras(save));
    // a new save past the change does not get the old gates
    const fresh = parseSave(JSON.stringify({ ...newSave(), cleared: 2, relic: 'fish', codex: ['palm'] }));
    expect(unlockedRelics(fresh)).toEqual(['ball', 'staff']);
    expect(fresh.relic).toBe('ball');
    expect(earnedSutras(fresh)).toEqual(['roar']);
  });

  it('opens a monk for buying at his chapter, and an owned one stays', () => {
    expect(monkOpen({ ...newSave(), cleared: 4 }, 'novice')).toBe(false);
    expect(monkOpen({ ...newSave(), cleared: 5 }, 'novice')).toBe(true);
    expect(monkOpen({ ...newSave(), monks: 0b011 }, 'fat')).toBe(true);
  });

  it('pays a blessing every ten stars, into every run', () => {
    expect(starTotal(withStars(9))).toBe(9);
    expect(blessingBonus(withStars(9))).toEqual({});
    expect(blessingBonus(withStars(10))).toEqual({ attack: 2 });
    expect(blessingBonus(withStars(60))).toEqual({ attack: 6, maxHp: 9 });
    expect(nextBlessing(withStars(10))?.stars).toBe(20);
    expect(nextBlessing(withStars(60))).toBeNull();
    const save = { ...withStars(20), chapter: 1 };
    expect(loadout(save).bonus.attack).toBe((loadout({ ...save, stars: save.stars.map(() => 0) }).bonus.attack ?? 0) + 2);
  });

  it('names what a first clear unlocks, for the chapter card', () => {
    expect(clearUnlocks(3)).toEqual([{ kind: 'relic', id: 'fish' }]);
    expect(clearUnlocks(5)).toEqual([{ kind: 'monk', id: 'novice' }, { kind: 'tier', tier: 3 }]);
    expect(clearUnlocks(11)).toEqual([{ kind: 'sutra', id: 'halo' }]);
    expect(clearUnlocks(4)).toEqual([]);
  });

  it('tells the results everything a run unlocked', () => {
    expect(tierChapter(3)).toBe(6);
    const before = { ...withStars(9), cleared: 5, chapter: 6, sutras: 0b1111 };
    const { reward } = settleRun(before, { chapter: 6, waves: 50, lowest: 100 });
    expect(reward.unlocks).toEqual([{ kind: 'blessing', stat: 'attack', n: 2 }]);
    const ten = settleRun({ ...before, cleared: 9, chapter: 10, stars: before.stars.map(() => 0) }, { chapter: 10, waves: 50 });
    expect(ten.reward.unlocks).toEqual([{ kind: 'monk', id: 'fat' }]);
    // chapter 8 cleared opens chapter 9, the first to drop Sacred gear
    expect(newUnlocks({ ...newSave(), cleared: 7 }, { ...newSave(), cleared: 8 })).toEqual([{ kind: 'tier', tier: 4 }]);
  });
});
