import { describe, expect, it } from 'vitest';
import { AMBIENT, AMBIENT_BOX, CORGI_AMBIENT, MONK_AMBIENT, AMBIENT_HOT, ambientAt, ambientCount, share } from './stageAmbient';

describe('stage ambient', () => {
  it('has a style for each of the five chapters in both themes', () => {
    expect(MONK_AMBIENT).toHaveLength(5);
    expect(CORGI_AMBIENT).toHaveLength(5);
  });

  it('keeps every speck in the box round the camera, faint near its edge', () => {
    for (const style of [...MONK_AMBIENT, ...CORGI_AMBIENT]) {
      for (let i = 0; i < style.count; i++) {
        for (const t of [0, 3.3, 17.9]) {
          const s = ambientAt(style, i, t, 900, -4200);
          expect(Math.abs(s.x - 900)).toBeLessThanOrEqual(AMBIENT_BOX.w / 2);
          expect(Math.abs(s.y + 4200)).toBeLessThanOrEqual(AMBIENT_BOX.h / 2);
          expect(s.alpha).toBeGreaterThanOrEqual(0);
          expect(s.alpha).toBeLessThanOrEqual(style.alpha);
          if (Math.abs(s.y + 4200) > AMBIENT_BOX.h / 2 - 10) expect(s.alpha).toBeLessThan(0.1);
        }
      }
    }
  });

  it('lets snow fall and wisps rise', () => {
    const snow = MONK_AMBIENT[2];
    const wisps = MONK_AMBIENT[3];
    // a short step never crosses a wrap for most specks; compare the drift over many
    let down = 0;
    let up = 0;
    for (let i = 0; i < 10; i++) {
      down += ambientAt(snow, i, 1.05, 0, 0).y - ambientAt(snow, i, 1, 0, 0).y;
      up += ambientAt(wisps, i, 1.05, 0, 0).y - ambientAt(wisps, i, 1, 0, 0).y;
    }
    expect(down).toBeGreaterThan(0);
    expect(up).toBeLessThan(0);
  });

  it('thins out and fades as the heat climbs', () => {
    const style = AMBIENT[0];
    expect(ambientCount(style, 0)).toBe(style.count);
    expect(ambientCount(style, 1)).toBeCloseTo(style.count * AMBIENT_HOT.count);
    const last = style.count - 1;
    expect(ambientAt(style, last, 2, 0, 0, 1).alpha).toBe(0);
    const quiet = ambientAt(style, 0, 2, 0, 0, 0).alpha;
    expect(ambientAt(style, 0, 2, 0, 0, 1).alpha).toBeCloseTo(quiet * AMBIENT_HOT.alpha);
  });

  it('keeps shares in [0, 1)', () => {
    for (let i = 0; i < 40; i++) for (let k = 0; k < 8; k++) {
      expect(share(i, k)).toBeGreaterThanOrEqual(0);
      expect(share(i, k)).toBeLessThan(1);
    }
  });
});
