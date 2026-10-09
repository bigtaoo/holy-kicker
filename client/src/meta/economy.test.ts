import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { bump, claimBonus, claimTask, claimable, dayKey, rollDay, taskState, today } from './daily';
import { canCollect, canDouble, collectPatrol, copperPerHour, fixPatrolClock, patrolHours, quickLeft, quickPatrol, startPatrol } from './patrol';
import { newSave, parseSave, type SaveData } from './save';
import { chestBlock, chestsLeft, openChest } from './shop';

const HOUR = 3600 * 1000;
// local noon, so adding a few hours stays on the same date
const NOON = new Date(2026, 9, 4, 12).getTime();
const TOMORROW = new Date(2026, 9, 5, 12).getTime();
const rand = () => 0.5;

function cleared(n = 1, extra: Partial<SaveData> = {}): SaveData {
  return { ...newSave(), firstRunDone: true, cleared: n, ...extra };
}

describe('daily', () => {
  it('keys the local date and starts a new day when it changes', () => {
    expect(dayKey(NOON)).toBe(20261004);
    let s = bump(cleared(), NOON, 'runs', 2);
    expect(today(s, NOON).progress[0]).toBe(2);
    expect(today(s, TOMORROW).progress[0]).toBe(0);
    s = rollDay(s, TOMORROW);
    expect(s.daily.day).toBe(20261005);
  });

  it('pays a done task once, and the bonus after all of them', () => {
    let s = cleared();
    const tasks = BALANCE.daily.tasks;
    expect(claimTask(s, NOON, 0)).toBe(s);
    tasks.forEach((g) => (s = bump(s, NOON, g.kind, g.n)));
    expect(claimable(s, NOON)).toBe(tasks.length);
    const before = s.jade;
    s = claimTask(s, NOON, 0);
    expect(taskState(s, s.daily, 0)).toBe('claimed');
    expect(s.jade).toBe(before + BALANCE.daily.jade);
    expect(claimTask(s, NOON, 0)).toBe(s);
    expect(claimBonus(s, NOON)).toBe(s);
    for (let i = 1; i < tasks.length; i++) s = claimTask(s, NOON, i);
    const all = claimBonus(s, NOON);
    expect(all.jade).toBe(s.jade + BALANCE.daily.bonusJade);
    expect(claimBonus(all, NOON)).toBe(all);
  });

  it('locks the patrol task until the patrol opens, and pays the bonus without it', () => {
    const tasks = BALANCE.daily.tasks;
    const later = tasks.map((g, i) => (g.kind === 'patrol' ? i : -1)).filter((i) => i >= 0);
    expect(later.length).toBeGreaterThan(0);
    let s = cleared(BALANCE.unlocks.patrolChapter - 1);
    tasks.forEach((g) => (s = bump(s, NOON, g.kind, g.n)));
    later.forEach((i) => expect(taskState(s, today(s, NOON), i)).toBe('locked'));
    expect(claimable(s, NOON)).toBe(tasks.length - later.length);
    expect(claimTask(s, NOON, later[0])).toBe(s);
    for (let i = 0; i < tasks.length; i++) s = claimTask(s, NOON, i);
    expect(claimable(s, NOON)).toBe(1);
    expect(claimBonus(s, NOON).jade).toBe(s.jade + BALANCE.daily.bonusJade);
    // once the patrol opens the same day, its task counts again
    const open = { ...s, cleared: BALANCE.unlocks.patrolChapter };
    later.forEach((i) => expect(taskState(open, open.daily, i)).toBe('ready'));
  });

  it('survives a round trip and repairs a broken daily', () => {
    const s = bump(cleared(), NOON, 'kills', 40);
    expect(parseSave(JSON.stringify(s)).daily).toEqual(s.daily);
    expect(parseSave(JSON.stringify({ ...s, daily: 'x' })).daily.progress).toEqual(BALANCE.daily.tasks.map(() => 0));
  });
});

describe('patrol', () => {
  it('starts once the shop opens and piles up to the cap', () => {
    expect(startPatrol(newSave(), NOON).patrol).toBe(0);
    const s = startPatrol(cleared(), NOON);
    expect(s.patrol).toBe(NOON);
    expect(patrolHours(s, NOON + 3 * HOUR)).toBe(3);
    expect(patrolHours(s, NOON + 99 * HOUR)).toBe(BALANCE.patrol.capHours);
  });

  it('pays copper and gear by the hour, doubled after an ad, and starts over', () => {
    const s = startPatrol(cleared(), NOON);
    expect(canCollect(s, NOON + 60 * 1000)).toBe(false);
    expect(collectPatrol(s, NOON + 60 * 1000, false)).toBeNull();
    const at = NOON + 6 * HOUR;
    const one = collectPatrol(s, at, false, rand)!;
    expect(one.haul.copper).toBe(Math.floor(copperPerHour(s) * 6));
    expect(one.haul.drops.length).toBe(6 / BALANCE.patrol.dropHours);
    expect(one.save.patrol).toBe(at);
    expect(today(one.save, at).progress[BALANCE.daily.tasks.findIndex((g) => g.kind === 'patrol')]).toBe(1);
    const two = collectPatrol(s, at, true, rand)!;
    expect(two.haul.copper).toBe(one.haul.copper * 2);
    expect(two.haul.drops.length).toBe(one.haul.drops.length * 2);
    expect(canDouble(s, NOON + 0.5 * HOUR)).toBe(false);
  });

  it('pays nothing for a clock that went back, and restarts from now', () => {
    const s = startPatrol(cleared(), NOON);
    expect(patrolHours(s, NOON - HOUR)).toBe(0);
    expect(fixPatrolClock(s, NOON - HOUR).patrol).toBe(NOON - HOUR);
  });

  it('allows a few quick patrols a day, for an ad or for jade', () => {
    let s = startPatrol(cleared(1, { jade: 1000 }), NOON);
    for (let i = 0; i < BALANCE.patrol.quickAdsPerDay; i++) s = quickPatrol(s, NOON, 'ad', rand)!.save;
    expect(quickLeft(s, NOON, 'ad')).toBe(0);
    expect(quickPatrol(s, NOON, 'ad', rand)).toBeNull();
    const paid = quickPatrol(s, NOON, 'jade', rand)!;
    expect(paid.save.jade).toBe(1000 - BALANCE.patrol.quickJade);
    expect(paid.haul.drops.length).toBe(BALANCE.patrol.quickDrops);
    expect(quickPatrol({ ...s, jade: 0 }, NOON, 'jade', rand)).toBeNull();
    expect(quickLeft(s, TOMORROW, 'ad')).toBe(BALANCE.patrol.quickAdsPerDay);
  });
});

describe('shop', () => {
  it('gives one free chest a day', () => {
    const s = cleared();
    const opened = openChest(s, NOON, 'free', rand)!;
    expect(opened.haul.copper).toBe(BALANCE.shop.freeChest.copper);
    expect(opened.haul.drops.length).toBe(BALANCE.shop.freeChest.drops);
    expect(chestBlock(opened.save, NOON, 'free')).toBe('used');
    expect(chestsLeft(opened.save, TOMORROW, 'free')).toBe(1);
  });

  it('caps the ad chests a day and pays their jade', () => {
    let s = cleared();
    for (let i = 0; i < BALANCE.shop.adChest.perDay; i++) s = openChest(s, NOON, 'ad', rand)!.save;
    expect(s.jade).toBe(BALANCE.shop.adChest.perDay * BALANCE.shop.adChest.jade);
    expect(openChest(s, NOON, 'ad', rand)).toBeNull();
  });

  it('sells the jade chest without a limit while the jade lasts', () => {
    const price = BALANCE.shop.jadeChest.jade;
    expect(chestBlock(cleared(1, { jade: price - 1 }), NOON, 'jade')).toBe('jade');
    let s = cleared(1, { jade: price * 2 });
    s = openChest(s, NOON, 'jade', rand)!.save;
    s = openChest(s, NOON, 'jade', rand)!.save;
    expect(s.jade).toBe(0);
    const gear = Object.values(s.gear).flat().reduce((a, b) => a + b, 0);
    expect(gear).toBe(1 + 2 * BALANCE.shop.jadeChest.drops);
    expect(chestsLeft(s, NOON, 'jade')).toBeNull();
  });
});
