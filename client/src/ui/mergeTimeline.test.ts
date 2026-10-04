import { describe, expect, it } from 'vitest';
import { COPIES, marks, mergeFrame, mergeTiming, skipTo } from './mergeTimeline';

describe('merge timeline', () => {
  const m = mergeTiming(false);
  const mk = marks(m);

  it('flies the copies in one after another, then charges, flashes and drops the item', () => {
    const start = mergeFrame(0, m);
    expect(start.copies).toEqual([0, 0, 0, 0, 0]);
    expect(start.item).toBeNull();
    const mid = mergeFrame(m.stagger * 2, m);
    expect(mid.copies[0]).toBeNull();
    expect(mid.copies[2]).toBe(0);
    const charging = mergeFrame(mk.landed + m.charge / 2, m);
    expect(charging.copies.every((c) => c === null)).toBe(true);
    expect(charging.charge).toBeCloseTo(0.5);
    const burst = mergeFrame(mk.burst, m);
    expect(burst.flash).toBe(1);
    expect(burst.item).not.toBeNull();
    const settled = mergeFrame(mk.dropped, m).item!;
    expect(settled.sx).toBeCloseTo(1);
    expect(mergeFrame(mk.counted, m)).toMatchObject({ card: 1, count: 1, flash: 0 });
  });

  it('the short version is quicker, and a tap skips to the card, then closes', () => {
    expect(marks(mergeTiming(true)).counted).toBeLessThan(mk.counted);
    expect(skipTo(0.1, m)).toBe(mk.counted);
    expect(skipTo(mk.counted, m)).toBe('close');
    expect(COPIES).toBe(5);
  });
});
