import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { claimBonus, claimTask, dayKey, newDaily } from './daily';
import { claimGoal, claimWeekBonus, newWeekly, weekKey } from './goals';
import { claimMerit, earnMerit, meritClaimable, meritWaiting, mergeMerit, newMerit, parseMerit, seasonOf, stepCopper, thisSeason, untilNextSeason } from './merit';
import { newSave, parseSave, type SaveData } from './save';

const M = BALANCE.merit;
const DAY = 24 * 3600 * 1000;
// the epoch's first UTC day, and noon on day 30: the second season
const EPOCH = Date.UTC(2026, 9, 26);
const LATER = EPOCH + 30 * DAY + DAY / 2;
const rand = () => 0.5;

function player(extra: Partial<SaveData> = {}): SaveData {
  return { ...newSave(), firstRunDone: true, cleared: 2, ...extra };
}

describe('merit path', () => {
  it('turns its season every few UTC days from the epoch', () => {
    expect(M.epoch).toBe(20261026);
    expect(seasonOf(EPOCH)).toBe(0);
    expect(seasonOf(EPOCH - DAY)).toBe(0);
    expect(seasonOf(EPOCH + M.days * DAY - 1)).toBe(0);
    expect(seasonOf(EPOCH + M.days * DAY)).toBe(1);
    expect(seasonOf(LATER)).toBe(1);
    expect(untilNextSeason(EPOCH)).toBe(M.days * DAY);
    expect(untilNextSeason(LATER)).toBe(2 * M.days * DAY - 30 * DAY - DAY / 2);
  });

  it('earns points for every claim of a task, a goal or their bonuses', () => {
    const now = EPOCH + DAY;
    let s = player({
      daily: newDaily(dayKey(now), [{ kind: 'runs', n: 1, id: '' }]),
      weekly: newWeekly(weekKey(now), [{ kind: 'runs', n: 1, id: '' }]),
    });
    s = { ...s, daily: { ...s.daily, progress: [1] }, weekly: { ...s.weekly, progress: [1] } };
    s = claimTask(s, now, 0);
    expect(s.merit).toEqual({ season: 0, points: M.points.task, claimed: 0 });
    s = claimBonus(s, now);
    s = claimGoal(s, now, 0);
    s = claimWeekBonus(s, now, rand)!.save;
    expect(s.merit.points).toBe(M.points.task + M.points.dailyBonus + M.points.goal + M.points.weekBonus);
    // a claim that pays nothing earns nothing
    expect(claimTask(s, now, 0)).toBe(s);
  });

  it('starts afresh once the season turns', () => {
    const s = player({ merit: { season: 0, points: 900, claimed: 7 } });
    expect(thisSeason(s, EPOCH)).toBe(s.merit);
    expect(thisSeason(s, LATER)).toEqual(newMerit(1));
    expect(meritClaimable(s, LATER)).toBe(0);
    expect(earnMerit(s, LATER, 'goal').merit).toEqual({ season: 1, points: M.points.goal, claimed: 0 });
  });

  it('pays every step reached at once, and never twice', () => {
    expect(claimMerit(player(), EPOCH, rand)).toBeNull();
    const at = M.steps[3].at;
    const s = player({ merit: { season: 0, points: at, claimed: 0b10 } });
    expect(meritWaiting(s.merit)).toEqual([0, 2, 3]);
    const paid = claimMerit(s, EPOCH, rand)!;
    const want = [0, 2, 3].map((i) => M.steps[i]);
    expect(paid.haul.copper).toBe(stepCopper(s, 0) + stepCopper(s, 2));
    expect(paid.haul.jade).toBe(want.reduce((n, st) => n + (st.jade ?? 0), 0));
    expect(paid.haul.drops).toHaveLength(want.reduce((n, st) => n + (st.drops ?? 0), 0));
    expect(paid.save.copper).toBe(s.copper + paid.haul.copper);
    expect(paid.save.merit.claimed).toBe(0b1111);
    expect(claimMerit(paid.save, EPOCH, rand)).toBeNull();
    expect(meritClaimable(paid.save, EPOCH)).toBe(0);
  });

  it('pays more copper the further the player has come', () => {
    expect(stepCopper(player({ cleared: 10 }), 0)).toBeGreaterThan(stepCopper(player({ cleared: 0 }), 0));
    expect(M.steps.every((s, i) => i === 0 || s.at > M.steps[i - 1].at)).toBe(true);
    expect(M.steps.every((s) => (s.copper ?? 0) + (s.jade ?? 0) + (s.drops ?? 0) > 0)).toBe(true);
  });

  it('merges one season by the more points and every claim, another by the later', () => {
    const a = { season: 1, points: 300, claimed: 0b1 };
    const b = { season: 1, points: 120, claimed: 0b100 };
    expect(mergeMerit(a, b)).toEqual({ season: 1, points: 300, claimed: 0b101 });
    const old = { season: 0, points: 2000, claimed: 0xff };
    expect(mergeMerit(a, old)).toBe(a);
    expect(mergeMerit(old, a)).toBe(a);
  });

  it('survives a round trip and repairs a broken one', () => {
    const s = player({ merit: { season: 1, points: 450, claimed: 0b11 } });
    expect(parseSave(JSON.stringify(s)).merit).toEqual(s.merit);
    expect(parseMerit('x')).toEqual(newMerit());
    expect(parseMerit({ season: -2, points: 1e9, claimed: 2 ** 40 })).toEqual({ season: 0, points: 999999, claimed: 2 ** M.steps.length - 1 });
  });
});
