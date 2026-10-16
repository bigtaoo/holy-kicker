import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { dayKey, today } from './daily';
import { settleRun } from './progress';
import { newSave } from './save';
import { addDrops, itemStats } from './gear';
import { afterRun, claimGift, giftGain, giftReady, nextGift } from './welcome';

const NOON = new Date(2026, 9, 4, 12).getTime();
const EVENING = new Date(2026, 9, 4, 20).getTime();
const TOMORROW = new Date(2026, 9, 5, 12).getTime();
const rand = () => 0.5;

describe('welcome gifts', () => {
  it('pays the first gift when the first run ends, won or lost, and names the next', () => {
    const run = settleRun(newSave(), { chapter: 1, waves: 3 }, rand).save;
    const { save, gift } = afterRun(run, NOON, 3, 40);
    const first = BALANCE.welcome[0];
    expect(gift!.drops).toEqual([{ item: first.item, tier: first.tier }]);
    expect(save.gear[first.item][first.tier]).toBe(run.gear[first.item][first.tier] + 1);
    expect(save.gifts).toBe(1);
    expect(save.firstDay).toBe(dayKey(NOON));
    expect(today(save, NOON).progress[0]).toBe(1);
    expect(nextGift(save)).toEqual(BALANCE.welcome[1]);
    // the next one waits for tomorrow
    expect(giftReady(save, EVENING)).toBe(false);
    expect(claimGift(save, EVENING)).toBeNull();
    // a second run the same day pays nothing more
    const again = afterRun(settleRun(save, { chapter: 1, waves: 3 }, rand).save, EVENING, 3, 40);
    expect(again.gift).toBeNull();
    expect(again.save.firstDay).toBe(dayKey(NOON));
  });

  it('pays one a day until they run out', () => {
    let s = afterRun(settleRun(newSave(), { chapter: 1, waves: 3 }, rand).save, NOON, 3, 40).save;
    for (let day = 1; day < BALANCE.welcome.length; day++) {
      const at = NOON + day * 24 * 3600 * 1000;
      expect(giftReady(s, at)).toBe(true);
      const got = claimGift(s, at)!;
      expect(got.n).toBe(day);
      expect(got.save.jade).toBe(s.jade + BALANCE.welcome[day].jade);
      expect(got.save.copper).toBe(s.copper + BALANCE.welcome[day].copper);
      s = got.save;
      expect(giftReady(s, at)).toBe(false);
    }
    expect(nextGift(s)).toBeNull();
    expect(giftReady(s, NOON + 30 * 24 * 3600 * 1000)).toBe(false);
  });

  it('waits for the first run, and a player from before the gifts gets them in the lobby', () => {
    expect(giftReady(newSave(), NOON)).toBe(false);
    const old = { ...newSave(), firstRunDone: true, runs: 12 };
    expect(giftReady(old, TOMORROW)).toBe(true);
    // a later run does not claim it for them, nor make it their first day
    const after = afterRun(settleRun(old, { chapter: 1, waves: 3 }, rand).save, TOMORROW, 3, 40);
    expect(after.gift).toBeNull();
    expect(after.save.firstDay).toBe(0);
    expect(claimGift(after.save, TOMORROW)!.n).toBe(0);
  });

  it('says what the gift adds when it is worn, and nothing when an item as good is owned', () => {
    const fresh = newSave();
    // an empty slot: all of its stats
    expect(giftGain(fresh, { item: 'robe', tier: 1 })).toEqual(itemStats('robe', 1));
    // over a Common robe: only what the Fine one raises (more health, and its first affix)
    const common = { ...fresh, gear: addDrops(fresh.gear, [{ item: 'robe', tier: 0 }]) };
    const [c, f] = [itemStats('robe', 0), itemStats('robe', 1)];
    expect(giftGain(common, { item: 'robe', tier: 1 })).toEqual({ maxHp: f.maxHp! - c.maxHp!, guard: f.guard });
    const fine = { ...fresh, gear: addDrops(fresh.gear, [{ item: 'robe', tier: 1 }]) };
    expect(giftGain(fine, { item: 'robe', tier: 1 })).toBeNull();
    // a relic other than the chosen one does not change the run's weapon
    expect(giftGain(fresh, { item: 'staff', tier: 2 })).toBeNull();
    expect(giftGain(fresh, { item: fresh.relic, tier: 2 })).not.toBeNull();
  });

  it('hands the first gift to the results with what it adds', () => {
    const run = settleRun(newSave(), { chapter: 1, waves: 3 }, rand).save;
    const { gift } = afterRun(run, NOON, 3, 40);
    const first = BALANCE.welcome[0];
    expect(gift!.gain).toEqual(giftGain(run, { item: first.item, tier: first.tier }));
  });
});
