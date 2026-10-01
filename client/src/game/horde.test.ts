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

  it('keeps a large crowd pressing on the target from collapsing', () => {
    const mobs = Array.from({ length: 400 }, (_, i) => ({ x: Math.cos(i) * (300 + i), y: Math.sin(i) * (300 + i) }));
    for (let f = 0; f < 300; f++) stepHorde(mobs, 0, 0, 1 / 60, params);
    let closest = Infinity;
    for (let i = 0; i < mobs.length; i++) {
      for (let j = i + 1; j < mobs.length; j++) {
        closest = Math.min(closest, Math.hypot(mobs[i].x - mobs[j].x, mobs[i].y - mobs[j].y));
      }
    }
    expect(closest).toBeGreaterThan(params.sepRadius * 0.5);
  });
});
