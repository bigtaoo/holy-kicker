import { describe, expect, it } from 'vitest';
import { CORPSE_LIFE, corpseAlpha, frameAt, knockDown, stepCorpse, type SheetMeta, holdsStill, SETTLE, stepPace, depthShade, greyTint, DEPTH_SHADE } from './mobAnim';

const meta: SheetMeta = { frames: 10, flash: 10, cols: 4, frameW: 1, frameH: 1, fps: 20, anchor: [0, 0], height: 1, lift: [] };

describe('frameAt', () => {
  it('loops at the sheet fps and offsets by phase', () => {
    expect(frameAt(meta, 0, 0)).toBe(0);
    expect(frameAt(meta, 0.26, 0)).toBe(5);
    expect(frameAt(meta, 0.5, 0)).toBe(0);
    expect(frameAt(meta, 0, 0.3)).toBe(3);
    expect(frameAt(meta, 0.45, 0.3)).toBe(2);
  });
});

describe('corpse', () => {
  it('flies back, lands tipped over and fades out', () => {
    const c = knockDown(0, 0, 1, 0, 400);
    let alive = true;
    let maxZ = 0;
    let t = 0;
    while (alive && t < 2) {
      alive = stepCorpse(c, 1 / 60);
      maxZ = Math.max(maxZ, c.z);
      t += 1 / 60;
    }
    expect(t).toBeCloseTo(CORPSE_LIFE, 1);
    expect(maxZ).toBeGreaterThan(30);
    expect(c.z).toBe(0);
    expect(c.x).toBeGreaterThan(50);
    expect(c.tilt).toBeCloseTo(Math.PI / 2);
    expect(corpseAlpha(c)).toBe(0);
  });
});

describe('jammed mobs', () => {
  const hop: SheetMeta = { ...meta, frames: 4, lift: [0, 20, 30, 0.5] };

  it('eases the pace toward the real speed', () => {
    let pace = 1;
    for (let i = 0; i < 60; i++) pace = stepPace(pace, 0.2, 110, 1 / 60);
    expect(pace).toBeLessThan(SETTLE);
    for (let i = 0; i < 60; i++) pace = stepPace(pace, 110 / 60, 110, 1 / 60);
    expect(pace).toBeGreaterThan(0.95);
  });

  it('stands only on a ground frame and only when slow', () => {
    expect(holdsStill(hop, 0, 0.1)).toBe(true);
    expect(holdsStill(hop, 3, 0.1)).toBe(true);
    expect(holdsStill(hop, 2, 0.1)).toBe(false);
    expect(holdsStill(hop, 0, 0.9)).toBe(false);
  });
});

describe('depth shade', () => {
  it('keeps the front ring bright and dims the crowd behind it', () => {
    expect(depthShade(100)).toBe(1);
    expect(depthShade(DEPTH_SHADE.near)).toBe(1);
    expect(depthShade(2000)).toBeCloseTo(DEPTH_SHADE.min);
    expect(depthShade(500)).toBeLessThan(1);
    expect(depthShade(500)).toBeGreaterThan(depthShade(700));
  });

  it('makes a grey tint', () => {
    expect(greyTint(1)).toBe(0xffffff);
    expect(greyTint(0)).toBe(0);
    expect(greyTint(0.5, 0xff0080)).toBe(0x800040);
    expect(greyTint(0.5)).toBe(0x808080);
  });
});
