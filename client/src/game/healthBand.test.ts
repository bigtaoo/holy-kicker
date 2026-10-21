import { describe, expect, it } from 'vitest';
import { BAND_AMBER, BAND_GREEN, BAND_RED, BAND_YELLOW_GREEN, PULSE_HZ, bandColor, redPulse } from './healthBand';

describe('bandColor', () => {
  it('steps through four bands without blending', () => {
    expect(bandColor(1)).toBe(BAND_GREEN);
    expect(bandColor(0.75)).toBe(BAND_GREEN);
    expect(bandColor(0.74)).toBe(BAND_YELLOW_GREEN);
    expect(bandColor(0.5)).toBe(BAND_YELLOW_GREEN);
    expect(bandColor(0.49)).toBe(BAND_AMBER);
    expect(bandColor(0.25)).toBe(BAND_AMBER);
    expect(bandColor(0.24)).toBe(BAND_RED);
    expect(bandColor(0)).toBe(BAND_RED);
  });
});

describe('redPulse', () => {
  it('starts at the band red and stays a red', () => {
    expect(redPulse(0)).toBe(BAND_RED);
    const peak = redPulse(0.5 / PULSE_HZ);
    expect(peak).not.toBe(BAND_RED);
    expect(peak >> 16).toBeGreaterThan((peak >> 8) & 0xff);
    expect(redPulse(1 / PULSE_HZ)).toBe(BAND_RED);
  });
});
