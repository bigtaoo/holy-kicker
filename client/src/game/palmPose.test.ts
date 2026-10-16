import { describe, expect, it } from 'vitest';
import { MOUNTAIN_EXIT, MOUNTAIN_HOLD, MOUNTAIN_SINK, PALM_DROP, PALM_FADE, PALM_HOLD, PALM_SQUASH, palmPose, palmSinks } from './palmPose';

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

  it('holds the Mountain Palm a moment, then sinks it deep long before its print stops pinning', () => {
    const fall = 0.4;
    const sinks = fall + palmSinks(MOUNTAIN_EXIT);
    expect(sinks - fall).toBeCloseTo(PALM_SQUASH + MOUNTAIN_HOLD);
    expect(palmPose(sinks - 0.01, fall, MOUNTAIN_EXIT)).toMatchObject({ scaleY: 1, alpha: 1, done: false });
    // eased in and still solid halfway down, then sunk deep as it goes
    const half = palmPose(sinks + MOUNTAIN_SINK / 2, fall, MOUNTAIN_EXIT);
    expect(half.alpha).toBeCloseTo(1);
    expect(half.scaleY).toBeLessThan(1);
    expect(palmPose(sinks + MOUNTAIN_SINK * 0.99, fall, MOUNTAIN_EXIT).scaleY).toBeLessThan(0.25);
    expect(palmPose(sinks + MOUNTAIN_SINK + 0.001, fall, MOUNTAIN_EXIT)).toMatchObject({ alpha: 0, done: true });
    // the evolved print pins for 2 s
    expect(palmSinks(MOUNTAIN_EXIT) + MOUNTAIN_SINK).toBeLessThan(1);
  });
});
