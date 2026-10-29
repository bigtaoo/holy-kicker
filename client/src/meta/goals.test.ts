import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { bump, claimBonus, claimTask, dayKey, newDaily, noteRun } from './daily';
import { claimGoal, claimWeekBonus, goalsClaimable, mergeWeekly, newWeekly, parseWeekly, thisWeek, untilNextWeek, weekGoals, weekKey } from './goals';
import { newSave, parseSave, type SaveData } from './save';
import { runTally } from './taskPool';

const HOUR = 3600 * 1000;
// a Wednesday, local noon: its week began on Monday the 26th
const WED = new Date(2026, 9, 28, 12).getTime();
const NEXT_WED = new Date(2026, 10, 4, 12).getTime();
const rand = () => 0.5;

function player(extra: Partial<SaveData> = {}): SaveData {
  return { ...newSave(), firstRunDone: true, cleared: 2, ...extra };
}

/** A save whose week holds a fixed board: 3 runs and 2 daily bonuses. */
function fixedWeek(now: number): SaveData {
  return player({ weekly: newWeekly(weekKey(now), [{ kind: 'runs', n: 3, id: '' }, { kind: 'daily', n: 2, id: '' }]) });
}

describe('weekly goals', () => {
  it('keys the local Monday and counts down to the next one', () => {
    expect(weekKey(WED)).toBe(20261026);
    expect(weekKey(new Date(2026, 9, 26, 0).getTime())).toBe(20261026);
    expect(weekKey(new Date(2026, 9, 25, 23).getTime())).toBe(20261019);
    expect(untilNextWeek(WED)).toBe(4 * 24 * HOUR + 12 * HOUR);
    expect(weekKey(WED + untilNextWeek(WED))).toBe(20261102);
    expect(weekKey(WED + untilNextWeek(WED) - 1)).toBe(20261026);
  });

  it('draws the same goals all week, always the runs and daily ones first', () => {
    const s = player();
    const w = thisWeek(s, WED);
    expect(w.tasks).toHaveLength(BALANCE.goals.count);
    expect(w.tasks.slice(0, 2).map((g) => g.kind)).toEqual(['runs', 'daily']);
    expect(thisWeek(s, WED + 2 * 24 * HOUR).tasks).toEqual(w.tasks);
    expect(weekGoals(s, 20261026)).toEqual(w.tasks);
    // the stored board starts afresh once the week turns
    const stored = { ...s, weekly: { ...w, progress: w.progress.map(() => 1) } };
    expect(thisWeek(stored, NEXT_WED).week).toBe(20261102);
    expect(thisWeek(stored, NEXT_WED).progress.every((p) => p === 0)).toBe(true);
    // a stored week with no tasks draws them when shown
    expect(thisWeek(player({ weekly: newWeekly(20261026) }), WED).tasks).toEqual(w.tasks);
  });

  it('counts runs and claimed daily bonuses', () => {
    let s = noteRun(fixedWeek(WED), WED, runTally({ waves: 10 }));
    expect(s.weekly.progress).toEqual([1, 0]);
    s = player({ ...s, daily: newDaily(dayKey(WED), [{ kind: 'runs', n: 1, id: '' }]) });
    s = bump(s, WED, 'runs', 1);
    expect(s.weekly.progress).toEqual([2, 0]);
    s = claimTask(s, WED, 0);
    s = claimBonus(s, WED);
    expect(s.weekly.progress).toEqual([2, 1]);
  });

  it('pays a done goal once, and the chest after all of them', () => {
    let s = fixedWeek(WED);
    expect(claimGoal(s, WED, 0)).toBe(s);
    expect(claimGoal(s, WED, 5)).toBe(s);
    s = { ...s, weekly: { ...s.weekly, progress: [3, 2] } };
    expect(goalsClaimable(s, WED)).toBe(2);
    expect(claimWeekBonus(s, WED, rand)).toBeNull();
    const paid = claimGoal(s, WED, 0);
    expect(paid.copper).toBe(s.copper + BALANCE.goals.copper);
    expect(paid.jade).toBe(s.jade + BALANCE.goals.jade);
    expect(claimGoal(paid, WED, 0)).toBe(paid);
    s = claimGoal(paid, WED, 1);
    expect(goalsClaimable(s, WED)).toBe(1);
    const chest = claimWeekBonus(s, WED, rand)!;
    expect(chest.haul.drops).toHaveLength(BALANCE.goals.bonusDrops);
    expect(chest.save.weekly.bonus).toBe(true);
    expect(goalsClaimable(chest.save, WED)).toBe(0);
    expect(claimWeekBonus(chest.save, WED, rand)).toBeNull();
  });

  it('merges one week by the most of each goal, and another week by the later', () => {
    const a = { ...fixedWeek(WED).weekly, progress: [3, 0], claimed: 1 };
    const b = { ...a, progress: [1, 2], claimed: 2, bonus: false };
    expect(mergeWeekly(a, b)).toEqual({ ...a, progress: [3, 2], claimed: 3 });
    const later = newWeekly(20261102);
    expect(mergeWeekly(a, later)).toBe(later);
    expect(mergeWeekly(later, a)).toBe(later);
  });

  it('survives a round trip and repairs a broken week', () => {
    const s = noteRun(player(), WED, runTally({ waves: 3, kills: 80 }));
    expect(parseSave(JSON.stringify(s)).weekly).toEqual(s.weekly);
    expect(parseWeekly('x')).toEqual(newWeekly());
    expect(parseWeekly({ week: -5, tasks: 'x' })).toEqual(newWeekly());
    expect(parseWeekly({ week: 20261026.7 }).week).toBe(20261026);
  });
});
