import { describe, expect, it } from 'vitest';
import { badgeOffsets, multiplyTint, nightTint } from './actLook';

describe('act looks', () => {
  it('keeps act 1 by day and darkens the later acts', () => {
    expect(nightTint(1)).toBe(0xffffff);
    expect(nightTint(5)).toBe(0xffffff);
    for (const c of [6, 11, 16, 20]) expect(nightTint(c)).not.toBe(0xffffff);
    expect(nightTint(6)).toBe(nightTint(10));
  });

  it('weakens the night on a darker map so its ground is as light as map 1 in that act', () => {
    const light = [80, 60, 100, 40, 80];
    const lit = (chapter: number) => {
      const t = nightTint(chapter, light);
      const l = 0.2126 * ((t >> 16) & 0xff) + 0.7152 * ((t >> 8) & 0xff) + 0.0722 * (t & 0xff);
      return (light[(chapter - 1) % 5] * l) / 255;
    };
    for (const act of [2, 3, 4]) {
      const first = (act - 1) * 5 + 1;
      expect(lit(first + 1)).toBeCloseTo(lit(first), 0); // the marsh, a little darker
      expect(lit(first + 4)).toBeCloseTo(lit(first), 0); // as light as map 1: the full night
      expect(nightTint(first + 4, light)).toBe(nightTint(first, light));
      expect(nightTint(first + 2, light)).toBe(nightTint(first, light)); // lighter: the full night
    }
    // half as light as map 1: no night is light enough, so it stays day
    expect(nightTint(9, light)).toBe(0xffffff);
    expect(nightTint(14, [80, 80, 80, 79, 80])).not.toBe(0xffffff);
  });

  it('multiplies tints channel by channel', () => {
    expect(multiplyTint(0xffffff, 0x123456)).toBe(0x123456);
    expect(multiplyTint(0x808080, 0xff0000)).toBe(0x800000);
  });

  it('centres a row of badges', () => {
    expect(badgeOffsets(1, 60, 10)).toEqual([0]);
    expect(badgeOffsets(2, 60, 10)).toEqual([-35, 35]);
  });
});
