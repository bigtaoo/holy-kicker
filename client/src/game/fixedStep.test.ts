import { describe, expect, it } from 'vitest';
import { FixedStep, MAX_STEPS, TICK_MS, lerpX } from './fixedStep';

describe('FixedStep', () => {
  it('runs 30 steps a second whatever the frame rate', () => {
    for (const fps of [30, 60, 120, 144]) {
      const f = new FixedStep();
      let steps = 0;
      for (let i = 0; i < fps * 10; i++) steps += f.advance(1000 / fps);
      expect(Math.abs(steps - 300)).toBeLessThanOrEqual(1);
    }
  });

  it('interpolates by the time left over', () => {
    const f = new FixedStep();
    expect(f.advance(TICK_MS * 1.5)).toBe(1);
    expect(f.alpha).toBeCloseTo(0.5);
    expect(lerpX({ x: 2000, y: 0, px: 1000, py: 0 }, f.alpha)).toBeCloseTo(1.5);
  });

  it('drops a long backlog instead of fast-forwarding through it', () => {
    const f = new FixedStep();
    expect(f.advance(2000)).toBe(MAX_STEPS);
    expect(f.alpha).toBe(0);
    expect(f.advance(TICK_MS)).toBe(1);
  });

  it('runs 60 steps a second on fast forward, still dropping a long backlog', () => {
    for (const fps of [30, 60, 144]) {
      const f = new FixedStep();
      let steps = 0;
      for (let i = 0; i < fps * 10; i++) steps += f.advance(1000 / fps, 2);
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1);
    }
    expect(new FixedStep().advance(2000, 2)).toBe(MAX_STEPS * 2);
  });

  it('runs 45 whole steps a second at 1.5x, its backlog cap a whole number too', () => {
    const f = new FixedStep();
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += f.advance(1000 / 60, 1.5);
    expect(Math.abs(steps - 450)).toBeLessThanOrEqual(1);
    expect(new FixedStep().advance(2000, 1.5)).toBe(Math.floor(MAX_STEPS * 1.5));
  });
});
