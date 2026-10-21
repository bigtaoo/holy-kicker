import { describe, expect, it } from 'vitest';
import { badgeOffsets, multiplyTint, nightTint } from './actLook';

describe('act looks', () => {
  it('keeps act 1 by day and darkens the later acts', () => {
    expect(nightTint(1)).toBe(0xffffff);
    expect(nightTint(5)).toBe(0xffffff);
    for (const c of [6, 11, 16, 20]) expect(nightTint(c)).not.toBe(0xffffff);
    expect(nightTint(6)).toBe(nightTint(10));
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
