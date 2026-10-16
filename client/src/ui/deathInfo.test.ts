import { describe, expect, it } from 'vitest';
import { BALANCE } from '../meta/balance';
import { deathCause, expectedLevel, nearestGoal } from './deathInfo';

const past = (best = 0, chests = 0, fell = 0) => ({ best, chests, fell });

describe('deathCause', () => {
  it('names the last blow, the horde for a plain or crowded mob blow', () => {
    expect(deathCause('crowd', 20, 20)).toBe('crowd');
    expect(deathCause('mob', 20, 20)).toBe('crowd');
    expect(deathCause('elite', 20, 20)).toBe('touch');
    expect(deathCause('boss', 20, 20)).toBe('touch');
    for (const src of ['charge', 'slam', 'emerge', 'bullet', 'zone'] as const) expect(deathCause(src, 20, 20)).toBe(src);
    expect(deathCause(null, 20, 20)).toBe('crowd');
  });

  it('blames the level when the hero is well below the wave normal', () => {
    const wave = 30;
    const normal = expectedLevel(wave);
    expect(deathCause('charge', Math.ceil(normal - BALANCE.fall.levelGap) - 1, wave)).toBe('level');
    expect(deathCause('charge', Math.ceil(normal - BALANCE.fall.levelGap) + 1, wave)).toBe('charge');
    // the opening waves rarely count: a fresh hero is close to normal
    expect(deathCause('crowd', 1, 1)).toBe('crowd');
  });
});

describe('expectedLevel', () => {
  it('starts at 1, follows the measured table and stays at its end past the last wave', () => {
    const { levelEvery, levels } = BALANCE.fall;
    expect(expectedLevel(0)).toBe(1);
    expect(expectedLevel(levelEvery)).toBe(levels[0]);
    expect(expectedLevel(levelEvery * 2)).toBe(levels[1]);
    expect(expectedLevel(levelEvery * 1.5)).toBeCloseTo((levels[0] + levels[1]) / 2);
    expect(expectedLevel(999)).toBe(levels[levels.length - 1]);
  });
});

describe('nearestGoal', () => {
  it('has none in the sandbox', () => {
    expect(nearestGoal(3, 0, past())).toBeNull();
  });

  it('points a first try at the next chest', () => {
    // fell on wave 9: 8 cleared, the wave 10 chest two away
    expect(nearestGoal(9, 50, past())).toEqual({ kind: 'chest', wave: 10, n: 2 });
  });

  it('skips claimed chests and picks the nearest of the rest', () => {
    // the first two chests claimed, best 28: fell on wave 27 (26 cleared), beating the best 3
    // away, the wave 30 chest 4, the shrine on 35 8
    expect(nearestGoal(27, 50, past(28, 0b11))).toEqual({ kind: 'best', wave: 28, n: 3 });
  });

  it('names the next shrine when it is nearest', () => {
    // fell on wave 14 with three chests claimed and a best of 30: the shrine on 15 is 1 away
    expect(nearestGoal(14, 50, past(30, 0b111))).toEqual({ kind: 'shrine', wave: 15, n: 1 });
  });

  it('prefers the chapter clear on the boss wave', () => {
    expect(nearestGoal(50, 50, past(49, 0b1111))).toEqual({ kind: 'clear', wave: 50, n: 1 });
  });

  it('celebrates a new best', () => {
    expect(nearestGoal(22, 50, past(18))).toEqual({ kind: 'record', wave: 21, n: 0 });
  });
});
