import { describe, expect, it } from 'vitest';
import { PALM_DROP, PALM_FADE, PALM_HOLD, PALM_SQUASH, palmHold, palmPose } from './palmPose';

describe('palmPose', () => {
  it('drops from the sky, faster and faster, while its shadow grows', () => {
    const start = palmPose(0, 0.3);
    expect(start).toMatchObject({ lift: PALM_DROP, alpha: 0, shadowAlpha: 0, done: false });
    const half = palmPose(0.15, 0.3);
    // eased in: past the halfway time, less than half the way down
    expect(half.lift).toBeGreaterThan(PALM_DROP / 2);
    expect(half.shadow).toBeGreaterThan(start.shadow);
    expect(palmPose(0.29, 0.3).lift).toBeLessThan(PALM_DROP * 0.1);
  });

  it('lands with the blast, squashes, holds and fades', () => {
    const fall = 0.4;
    expect(palmPose(fall, fall)).toMatchObject({ lift: 0, scaleX: 1, scaleY: 1, alpha: 1 });
    const squash = palmPose(fall + PALM_SQUASH / 2, fall);
    expect(squash.scaleY).toBeLessThan(1);
    expect(squash.scaleX).toBeGreaterThan(1);
    const held = palmPose(fall + PALM_SQUASH + PALM_HOLD - 0.01, fall);
    expect(held).toMatchObject({ scaleY: 1, alpha: 1, shadowAlpha: 0, done: false });
    expect(palmPose(fall + PALM_SQUASH + PALM_HOLD + PALM_FADE / 2, fall).alpha).toBeCloseTo(0.5);
    expect(palmPose(fall + PALM_SQUASH + PALM_HOLD + PALM_FADE, fall)).toMatchObject({ alpha: 0, done: true });
  });

  it('holds the Mountain Palm for as long as its print pins, then sinks as it fades', () => {
    const fall = 0.4;
    expect(palmHold(0)).toBe(PALM_HOLD);
    const hold = palmHold(2);
    expect(PALM_SQUASH + hold + PALM_FADE).toBeCloseTo(2);
    expect(palmPose(fall + 1.5, fall, hold)).toMatchObject({ scaleY: 1, alpha: 1, done: false });
    const fading = palmPose(fall + PALM_SQUASH + hold + PALM_FADE / 2, fall, hold);
    expect(fading.scaleY).toBeLessThan(1);
    expect(palmPose(fall + 2, fall, hold).done).toBe(true);
  });
});
