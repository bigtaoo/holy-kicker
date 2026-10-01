import { describe, expect, it } from 'vitest';
import { CORPSE_LIFE, corpseAlpha, frameAt, knockDown, stepCorpse, type SheetMeta } from './mobAnim';

const meta: SheetMeta = { frames: 10, cols: 4, frameW: 1, frameH: 1, fps: 20, anchor: [0, 0], height: 1, lift: [] };

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
