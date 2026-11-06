import { describe, expect, it } from 'vitest';
import { POP, ROW_FADE, ROW_STEP, popScale, rowAlpha } from './haulPanel';

describe('haul popup pop', () => {
  it('grows the box past full size and settles on it', () => {
    expect(popScale(0)).toBeCloseTo(0.6);
    const peak = Math.max(...Array.from({ length: 20 }, (_, i) => popScale((i / 20) * POP)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
    expect(popScale(POP)).toBe(1);
    expect(popScale(10)).toBe(1);
  });

  it('brings the rows in one after another once the box is up', () => {
    expect(rowAlpha(0, POP)).toBe(0);
    expect(rowAlpha(0, POP + ROW_FADE)).toBe(1);
    expect(rowAlpha(1, POP + ROW_FADE)).toBeLessThan(1);
    expect(rowAlpha(3, POP + 3 * ROW_STEP + ROW_FADE)).toBe(1);
  });
});
