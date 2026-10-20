import { describe, expect, it } from 'vitest';
import { BossFall, FALL_TIME, fallPose } from './bossFall';

describe('boss fall', () => {
  it('stands until the blow, then sinks and is gone by the end', () => {
    expect(fallPose(-1)).toEqual({ dx: 0, scaleX: 1, scaleY: 1, alpha: 1 });
    const mid = fallPose(FALL_TIME * 0.7);
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
    expect(mid.scaleY).toBeLessThan(1);
    expect(fallPose(FALL_TIME).alpha).toBe(0);
    expect(fallPose(FALL_TIME + 5).alpha).toBe(0);
  });

  it('shudders first, then lies still', () => {
    expect(Math.abs(fallPose(0.01).dx)).toBeGreaterThan(0);
    expect(fallPose(FALL_TIME).dx).toBe(0);
  });

  it('runs on the view clock and starts over for the next boss', () => {
    const f = new BossFall();
    expect(f.step(false, 0.1).alpha).toBe(1);
    f.step(true, 0.1); // the frame it went down is t = 0
    for (let i = 0; i < 60; i++) f.step(true, 1 / 30);
    expect(f.step(true, 0).alpha).toBe(0);
    expect(f.step(false, 0.1).alpha).toBe(1);
    expect(f.step(true, 0.1).alpha).toBe(1);
  });
});
