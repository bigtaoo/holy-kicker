import { describe, expect, it } from 'vitest';
import { SHEEN, sheenAt } from './playSheen';

describe('sheenAt', () => {
  it('sweeps from off the left edge to off the right, then rests', () => {
    expect(sheenAt(0)).toBeCloseTo(-0.2);
    expect(sheenAt(SHEEN.sweep / 2)).toBeCloseTo(0.5);
    expect(sheenAt(SHEEN.sweep - 1e-6)).toBeCloseTo(1.2, 3);
    expect(sheenAt(SHEEN.sweep + 0.1)).toBeNull();
  });

  it('repeats every period', () => {
    expect(sheenAt(SHEEN.every + 0.2)).toBeCloseTo(sheenAt(0.2)!);
    expect(sheenAt(-SHEEN.every + 0.2)).toBeCloseTo(sheenAt(0.2)!);
  });
});
