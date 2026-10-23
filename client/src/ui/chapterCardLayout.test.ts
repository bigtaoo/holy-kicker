import { describe, expect, it } from 'vitest';
import { cardLinesLayout, CHESTS_TOP } from './chapterCardLayout';

describe('cardLinesLayout', () => {
  it('leaves the chests where they are with no line', () => {
    expect(cardLinesLayout([], true)).toEqual({ ys: [], chests: CHESTS_TOP });
  });

  it('stacks the lines by their own heights, so a wrapped one pushes the next down', () => {
    const one = cardLinesLayout([60, 60], false);
    const wrapped = cardLinesLayout([120, 60], false);
    expect(one.ys[1] - one.ys[0]).toBe(60);
    expect(wrapped.ys[1] - wrapped.ys[0]).toBe(90);
    expect(wrapped.chests - one.chests).toBe(60);
  });

  it('starts the lines under the ranks button', () => {
    const [y] = cardLinesLayout([120], true).ys;
    expect(y - 60).toBeGreaterThanOrEqual(200);
    expect(cardLinesLayout([120], false).ys[0]).toBeLessThan(y);
  });

  it('keeps the chests under the last line', () => {
    const { ys, chests } = cardLinesLayout([60, 120], true);
    expect(chests).toBeGreaterThan(ys[1] + 60);
  });
});
