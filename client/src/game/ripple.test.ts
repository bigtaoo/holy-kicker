import { describe, expect, it } from 'vitest';
import { FISH_SHOW, fishPop, rippleAt } from './ripple';

describe('wooden fish ripple', () => {
  it('grows to its reach at the ring speed, then fades in place', () => {
    expect(rippleAt(0, 400, 1000)).toEqual({ radius: 0, alpha: 1 });
    expect(rippleAt(0.2, 400, 1000)).toEqual({ radius: 200, alpha: 1 });
    const fading = rippleAt(0.5, 400, 1000)!;
    expect(fading.radius).toBe(400);
    expect(fading.alpha).toBeGreaterThan(0);
    expect(fading.alpha).toBeLessThan(1);
    expect(rippleAt(1, 400, 1000)).toBeNull();
  });

  it('pops the fish up past full size and back to nothing', () => {
    expect(fishPop(0)).toBe(0);
    expect(fishPop(FISH_SHOW * 0.2)).toBeCloseTo(1.15);
    expect(fishPop(FISH_SHOW * 0.5)).toBe(1);
    expect(fishPop(FISH_SHOW)).toBe(0);
  });
});
