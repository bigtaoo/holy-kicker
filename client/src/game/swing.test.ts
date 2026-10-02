import { describe, expect, it } from 'vitest';
import { swingAngle, swingArc } from './swing';

describe('staff swing', () => {
  it('turns a half circle centred on the aim, clockwise when facing right', () => {
    // aim straight down (a quarter turn, y down)
    const a = swingArc(16384, 300, false, 1);
    expect(a.from).toBeCloseTo(0);
    expect(a.to).toBeCloseTo(Math.PI);
    expect(swingAngle(a, 0)).toBeCloseTo(0);
    expect(swingAngle(a, 1)).toBeCloseTo(Math.PI);
    expect(swingAngle(a, 0.5)).toBeGreaterThan(Math.PI / 2);
  });

  it('turns the other way facing left, and all the way round awakened', () => {
    const left = swingArc(16384, 300, false, -1);
    expect(left.from).toBeCloseTo(Math.PI);
    expect(left.to).toBeCloseTo(0);
    const full = swingArc(0, 400, true, 1);
    expect(full.to - full.from).toBeCloseTo(Math.PI * 2);
    expect(full.swing).toBeGreaterThan(left.swing);
  });
});
