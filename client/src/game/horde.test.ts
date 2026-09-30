import { describe, expect, it } from 'vitest';
import { stepHorde } from './horde';

const params = { speed: 100, stopDist: 50, sepRadius: 40 };

describe('stepHorde', () => {
  it('walks a lone mob toward the target at its speed', () => {
    const mobs = [{ x: 0, y: 0 }];
    stepHorde(mobs, 1000, 0, 0.5, params);
    expect(mobs[0].x).toBeCloseTo(50);
    expect(mobs[0].y).toBeCloseTo(0);
  });

  it('stops pressing in once close to the target', () => {
    const mobs = [{ x: 30, y: 0 }];
    stepHorde(mobs, 0, 0, 1, params);
    expect(mobs[0]).toEqual({ x: 30, y: 0 });
  });

  it('pushes overlapping mobs apart', () => {
    const mobs = [{ x: -5, y: 0 }, { x: 5, y: 0 }];
    stepHorde(mobs, 0, 0, 0.1, params);
    expect(mobs[1].x - mobs[0].x).toBeGreaterThan(10);
  });
});
