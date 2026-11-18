import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { dayKey } from './daily';
import { newSave } from './save';
import { tomorrowOf } from './tomorrow';

const NOW = Date.UTC(2026, 10, 18, 12);

describe('tomorrow', () => {
  it('says nothing before the daily is played', () => {
    expect(tomorrowOf(newSave(), NOW, false, 3)).toBeNull();
  });

  it("names the streak's next day, and the gift tomorrow when today's was claimed", () => {
    const save = { ...newSave(), firstRunDone: true, gifts: 2, giftDay: dayKey(NOW) };
    expect(tomorrowOf(save, NOW, true, 3)).toEqual({ streak: 4, gift: 3 });
  });

  it("leaves the gift out while today's still waits, and once every gift is claimed", () => {
    const waiting = { ...newSave(), firstRunDone: true, gifts: 2, giftDay: dayKey(NOW) - 1 };
    expect(tomorrowOf(waiting, NOW, true, 0)).toEqual({ streak: 1, gift: null });
    const all = { ...newSave(), firstRunDone: true, gifts: BALANCE.welcome.length, giftDay: dayKey(NOW) };
    expect(tomorrowOf(all, NOW, true, 5)!.gift).toBeNull();
  });
});
