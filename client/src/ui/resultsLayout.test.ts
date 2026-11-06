import { describe, expect, it } from 'vitest';
import { fitScale, rowCentres, WIDE_GAP, WIDE_PAD, WIDE_ROW_H, widePlan } from './resultsLayout';

describe('results landscape layout', () => {
  it('puts two columns side by side with the taller one filling its band and the shorter centred in it', () => {
    const p = widePlan(840, [400, 300, 100], [200]);
    expect(p.w).toBe(2 * 840 + 3 * WIDE_PAD);
    expect(p.leftX).toBe(-p.rightX);
    expect(p.rightX - p.leftX).toBe(840 + WIDE_PAD);
    const band = 400 + 300 + 100 + 2 * WIDE_GAP;
    expect(p.bottom - p.top).toBe(band);
    expect(p.left).toEqual([p.top, p.top + 400 + WIDE_GAP, p.top + 700 + 2 * WIDE_GAP]);
    expect(p.right[0]).toBe(p.top + (band - 200) / 2);
  });

  it('keeps the panel centred on the origin with the button row inside its foot', () => {
    const p = widePlan(840, [600], [900, 120]);
    expect(p.top).toBe(-p.h / 2 + WIDE_PAD);
    expect(p.ruleY).toBeGreaterThan(p.bottom);
    expect(p.rowY + WIDE_ROW_H / 2).toBe(p.h / 2);
  });

  it('centres a row of buttons on 0, in order', () => {
    expect(rowCentres([450, 450, 640], 30)).toEqual([-575, -95, 480]);
    expect(rowCentres([640], 30)).toEqual([0]);
  });

  it('shrinks a panel to the frame but never grows it', () => {
    expect(fitScale(1000, 500, 2560, 1440, 40)).toBe(1);
    expect(fitScale(1890, 1500, 2560, 1440, 40)).toBeCloseTo(1360 / 1500);
  });
});
