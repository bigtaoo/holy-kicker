import { describe, expect, it } from 'vitest';
import { newWeekly, weekKey } from './goals';
import { newSave } from './save';
import { trainNode } from './training';
import { affordableTraining, lobbyWaiting, lossStep, mergesReady, waitingCount } from './waiting';

const played = { ...newSave(), firstRunDone: true, level: 5 };

describe('lobby waiting', () => {
  it('counts nothing on a fresh save', () => {
    expect(waitingCount(lobbyWaiting(newSave(), 0))).toBe(0);
  });

  it('counts the weekly goals ready to claim once the tasks are open', () => {
    const now = new Date(2026, 9, 28, 12).getTime();
    const weekly = { ...newWeekly(weekKey(now), [{ kind: 'runs' as const, n: 1, id: '' }, { kind: 'kills' as const, n: 9, id: '' }]), progress: [1, 9] };
    expect(lobbyWaiting({ ...played, weekly }, now).goals).toBe(2);
    expect(lobbyWaiting({ ...newSave(), weekly }, now).goals).toBe(0);
  });

  it('counts every chest waiting, both tracks', () => {
    const save = { ...played, chests: [0b111, 0b1, 0, 0, 0], opened: [0b1, 0, 0, 0, 0], hardChests: [0b11, 0, 0, 0, 0] };
    expect(lobbyWaiting(save, 0).chests).toBe(5);
  });

  it('counts the training once, whatever the copper buys', () => {
    const rich = { ...played, copper: 1e6 };
    expect(lobbyWaiting(rich, 0).train).toBe(true);
    expect(waitingCount(lobbyWaiting(rich, 0))).toBe(1);
    expect(lobbyWaiting({ ...rich, firstRunDone: false }, 0).train).toBe(false);
  });

  it('adds up the nodes the copper buys in a row, up to the level', () => {
    const [a, b] = [trainNode(1), trainNode(2)];
    const r = affordableTraining({ ...played, level: 2, copper: a.cost + b.cost + 1 });
    expect(r.n).toBe(2);
    expect(r.stats[a.stat]).toBe(a.value);
    expect(affordableTraining({ ...played, copper: a.cost - 1 }).n).toBe(0);
    expect(affordableTraining({ ...played, level: 1, copper: 1e6 }).n).toBe(1);
  });

  it('counts the merges Merge all would do', () => {
    const save = { ...played, copper: 1e6, gear: { ...played.gear, robe: played.gear.robe.map((_, i) => (i === 0 ? 10 : 0)) } };
    expect(mergesReady(save)).toBe(2);
    expect(mergesReady({ ...save, firstRunDone: false })).toBe(0);
  });

  it('points a loss to the training first, then the merges, else nowhere', () => {
    const robes = { ...played.gear, robe: played.gear.robe.map((_, i) => (i === 0 ? 10 : 0)) };
    const a = trainNode(1);
    expect(lossStep({ ...played, copper: a.cost, gear: robes })?.tab).toBe('train');
    // the training waits on the level: the copper goes to the merges
    expect(lossStep({ ...played, level: 0, copper: 1e6, gear: robes })).toEqual({ tab: 'gear', n: 2 });
    expect(lossStep({ ...played, copper: 0 })).toBeNull();
  });
});
