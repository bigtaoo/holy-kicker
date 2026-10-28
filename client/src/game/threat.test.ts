import { describe, expect, it } from 'vitest';
import { ALARM_TIME, THREAT_TIME, alarmFade, alarmLevel, threatAlpha } from './threat';

describe('threatAlpha', () => {
  it('is solid until the last stretch, then fades out', () => {
    expect(threatAlpha(THREAT_TIME)).toBe(1);
    expect(threatAlpha(0.2)).toBeCloseTo(0.5);
    expect(threatAlpha(0)).toBe(0);
    expect(threatAlpha(-1)).toBe(0);
  });
});

describe('alarm fade', () => {
  it('is full for most of its time and eases back at the end', () => {
    expect(alarmLevel(ALARM_TIME)).toBe(1);
    expect(alarmLevel(0.075)).toBeCloseTo(0.5);
    expect(alarmLevel(0)).toBe(0);
  });

  it('halves effects near the hero and leaves far ones alone', () => {
    expect(alarmFade(1, 0, 0)).toBe(0.5);
    expect(alarmFade(1, 150, 100)).toBe(0.5);
    expect(alarmFade(1, 230, 0)).toBeCloseTo(0.75);
    expect(alarmFade(1, 300, 0)).toBe(1);
    expect(alarmFade(0, 0, 0)).toBe(1);
    expect(alarmFade(0.5, 0, 0)).toBe(0.75);
  });
});
