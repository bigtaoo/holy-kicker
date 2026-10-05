import { describe, expect, it } from 'vitest';
import { achievementOrder, achievementProgress, achievementState, achievementsReady, claimAchievement, claimAllAchievements, readyJade } from './achievements';
import { BALANCE } from './balance';
import { settleRun } from './progress';
import { newSave, parseSave } from './save';

const GOALS = BALANCE.achievements;
const at = (kind: string, n: number) => GOALS.findIndex((g) => g.kind === kind && g.n === n);

describe('achievements', () => {
  it('fit in the claimed bits, each kind climbing', () => {
    expect(GOALS.length).toBeLessThanOrEqual(30);
    for (const g of GOALS) expect(g.jade).toBeGreaterThan(0);
  });

  it('read their progress from the save', () => {
    const s = { ...newSave(), runs: 7, kills: 1200, cleared: 2, level: 11 };
    expect(achievementProgress(s, 'runs')).toBe(7);
    expect(achievementProgress(s, 'monks')).toBe(1);
    expect(achievementProgress(s, 'tier')).toBe(0);
    s.gear = { ...s.gear, robe: [0, 0, 1, 0, 0] };
    expect(achievementProgress(s, 'tier')).toBe(2);
    expect(achievementState(s, at('runs', 5))).toBe('ready');
    expect(achievementState(s, at('runs', 25))).toBe('open');
    expect(achievementState(s, at('kills', 1000))).toBe('ready');
    expect(achievementState(s, at('clear', 2))).toBe('ready');
    expect(achievementState(s, at('clear', 3))).toBe('open');
    expect(achievementState(s, at('tier', 2))).toBe('ready');
  });

  it('pay jade once, one at a time or all at once', () => {
    const s = { ...newSave(), runs: 30, cleared: 1 };
    const ready = achievementsReady(s);
    expect(ready).toEqual([at('runs', 5), at('runs', 25), at('clear', 1)]);
    const one = claimAchievement(s, at('runs', 5));
    expect(one.jade).toBe(GOALS[at('runs', 5)].jade);
    expect(claimAchievement(one, at('runs', 5))).toBe(one);
    expect(claimAchievement(s, at('runs', 100))).toBe(s);
    const all = claimAllAchievements(s);
    expect(all.jade).toBe(readyJade(s));
    expect(achievementsReady(all)).toEqual([]);
    // the panel lists the ready ones first and the claimed last
    const order = achievementOrder(one);
    expect(order.slice(0, 2)).toEqual([at('runs', 25), at('clear', 1)]);
    expect(order[order.length - 1]).toBe(at('runs', 5));
  });

  it('count every run\'s kills and keep the claims in the save', () => {
    const s = settleRun(settleRun(newSave(), { chapter: 1, waves: 3, kills: 400 }).save, { chapter: 1, waves: 3, kills: 700 }).save;
    expect(s.kills).toBe(1100);
    const claimed = claimAchievement(s, at('kills', 1000));
    const back = parseSave(JSON.stringify(claimed));
    expect(back.kills).toBe(1100);
    expect(achievementState(back, at('kills', 1000))).toBe('claimed');
    // a version 3 save starts with none claimed and its progress waiting
    const old = parseSave(JSON.stringify({ version: 3, runs: 6 }));
    expect(old.achieved).toBe(0);
    expect(achievementState(old, at('runs', 5))).toBe('ready');
  });
});
