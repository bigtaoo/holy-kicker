import { MONK_IDS } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { newSave, type SaveData } from './save';
import {
  boardBonusReady, boardClaimable, boardState, bumpBoard, drawTasks, eligible, mergeBoards, parseBoard, parseTasks, runBoard, runTally,
  seeded, type Board, type PoolEntry,
} from './taskPool';

const POOL = BALANCE.daily.pool;
const COUNT = BALANCE.daily.count;

function player(extra: Partial<SaveData> = {}): SaveData {
  return { ...newSave(), firstRunDone: true, ...extra };
}

/** A save far along: every relic, both first monks, hard mode open in chapter 1. */
const veteran = () => player({ cleared: 16, monks: 0b11, stars: newSave().stars.map((_, i) => (i < 16 ? 3 : 0)) });

function board(tasks: Board['tasks']): Board {
  return parseBoard({}, tasks);
}

describe('seeded', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = seeded(7);
    const b = seeded(7);
    for (let i = 0; i < 50; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('drawTasks', () => {
  it('draws the same tasks for a day on every reload, and other ones on other days', () => {
    const s = veteran();
    const first = drawTasks(POOL, COUNT, s, 20261029);
    expect(drawTasks(POOL, COUNT, s, 20261029)).toEqual(first);
    const days = Array.from({ length: 14 }, (_, i) => JSON.stringify(drawTasks(POOL, COUNT, s, 20261101 + i)));
    expect(new Set(days).size).toBeGreaterThan(7);
  });

  it('always offers the easy run task, in pool order, and the count asked for', () => {
    for (let day = 20261001; day < 20261031; day++) {
      const tasks = drawTasks(POOL, COUNT, veteran(), day);
      expect(tasks).toHaveLength(COUNT);
      expect(tasks[0].kind).toBe('runs');
      const order = tasks.map((t) => POOL.findIndex((e) => e.kind === t.kind));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('offers only what the save has opened', () => {
    const fresh = player();
    for (let day = 20261001; day < 20261061; day++) {
      for (const t of drawTasks(POOL, COUNT, fresh, day)) expect(['runs', 'waves', 'kills', 'chests', 'patrol']).toContain(t.kind);
    }
    expect(eligible(fresh, { kind: 'relic', n: 1 })).toBe(false);
    expect(eligible(fresh, { kind: 'monk', n: 1 })).toBe(false);
    expect(eligible(fresh, { kind: 'hard', n: 1 })).toBe(false);
    expect(eligible(fresh, { kind: 'boss', n: 1, cleared: 1 })).toBe(false);
    expect(eligible(veteran(), { kind: 'hard', n: 1 })).toBe(true);
  });

  it('names a relic or monk the player owns, never the one in use', () => {
    const s = { ...veteran(), relic: 'staff' as const, monk: MONK_IDS[0] };
    const pool: PoolEntry[] = [{ kind: 'relic', n: 1 }, { kind: 'monk', n: 2 }];
    for (let day = 20261001; day < 20261031; day++) {
      const [relic, monk] = drawTasks(pool, 2, s, day);
      expect(relic.id).not.toBe('staff');
      expect(relic.id).not.toBe('');
      expect(monk.id).toBe(MONK_IDS[1]);
    }
    expect(drawTasks([{ kind: 'runs', n: 3 }], 5, s, 1)).toEqual([{ kind: 'runs', n: 3, id: '' }]);
  });
});

describe('parseTasks and parseBoard', () => {
  it('reads valid tasks back and drops a broken list', () => {
    const tasks = [{ kind: 'relic', n: 2, id: 'fish' }, { kind: 'kills', n: 0.5 }];
    expect(parseTasks(tasks)).toEqual([{ kind: 'relic', n: 2, id: 'fish' }, { kind: 'kills', n: 1, id: '' }]);
    expect(parseTasks([])).toBeNull();
    expect(parseTasks('x')).toBeNull();
    expect(parseTasks([{ kind: 'dance', n: 1 }])).toBeNull();
    expect(parseTasks([null])).toBeNull();
  });

  it('clamps progress and claims to the tasks', () => {
    const tasks = parseTasks([{ kind: 'runs', n: 3 }, { kind: 'kills', n: 9 }])!;
    expect(parseBoard({ progress: [2, -4, 7], claimed: 255, bonus: 'yes' }, tasks)).toEqual({ tasks, progress: [2, 0], claimed: 3, bonus: false });
  });
});

describe('a board', () => {
  const tasks = parseTasks([
    { kind: 'runs', n: 2 }, { kind: 'reach', n: 30 }, { kind: 'relic', n: 1, id: 'fish' }, { kind: 'monk', n: 1, id: 'fat' },
    { kind: 'hard', n: 1 }, { kind: 'elites', n: 3 }, { kind: 'boss', n: 1 }, { kind: 'evolve', n: 1 },
  ])!;

  it('counts a run: sums, the furthest wave, and a named relic or monk only when used', () => {
    let b = board(tasks);
    b = runBoard(b, runTally({ waves: 25, relic: 'staff', monk: 'fat', elites: 2, evolved: 1 }));
    b = runBoard(b, runTally({ waves: 12, relic: 'fish', hard: true, bosses: 1 }));
    expect(b.progress).toEqual([2, 25, 1, 1, 1, 2, 1, 1]);
    expect(boardState(b, 0)).toBe('ready');
    expect(boardState(b, 1)).toBe('open');
    expect(runBoard(board(parseTasks([{ kind: 'chests', n: 1 }])!), runTally({})).progress).toEqual([0]);
  });

  it('bumps only the tasks of one kind, and nothing for none', () => {
    const b = board(tasks);
    expect(bumpBoard(b, 'elites', 2).progress[5]).toBe(2);
    expect(bumpBoard(b, 'patrol', 1)).toBe(b);
    expect(bumpBoard(b, 'runs', 0)).toBe(b);
  });

  it('waits for every claim before the bonus', () => {
    const two = parseTasks([{ kind: 'runs', n: 1 }, { kind: 'kills', n: 5 }])!;
    let b = { ...board(two), progress: [1, 5] };
    expect(boardClaimable(b)).toBe(2);
    expect(boardBonusReady(b)).toBe(false);
    b = { ...b, claimed: 3 };
    expect(boardBonusReady(b)).toBe(true);
    expect(boardClaimable(b)).toBe(1);
    expect(boardBonusReady({ ...b, bonus: true })).toBe(false);
  });

  it('merges the same draw by the most progress and every claim, and keeps the leader on another', () => {
    const a = { ...board(tasks), progress: [2, 10, 0, 0, 0, 1, 0, 0], claimed: 1 };
    const b = { ...board(tasks), progress: [1, 30, 1, 0, 0, 0, 0, 0], claimed: 2, bonus: true };
    expect(mergeBoards(a, b)).toEqual({ tasks, progress: [2, 30, 1, 0, 0, 1, 0, 0], claimed: 3, bonus: true });
    const other = board(tasks.slice(1));
    expect(mergeBoards(a, other)).toBe(a);
  });
});
