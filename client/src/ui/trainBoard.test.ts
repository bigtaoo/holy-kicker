import { describe, expect, it } from 'vitest';
import { BOARD_ROW, BOARD_STEP, boardPage, boardPos, boardRows, pageCount, pageRange, ringPulse } from './trainBoard';

describe('train board', () => {
  it('snakes: each node is one step from the one before it', () => {
    for (let n = 2; n <= 50; n++) {
      const a = boardPos(n - 1);
      const b = boardPos(n);
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      expect(d === BOARD_STEP || d === BOARD_ROW).toBe(true);
    }
  });

  it('runs left to right on the first row and back on the second, centred on 0', () => {
    expect(boardPos(1).x).toBe(-boardPos(10).x);
    expect(boardPos(1).x).toBeLessThan(0);
    expect(boardPos(11).x).toBe(boardPos(10).x);
    expect(boardPos(20).x).toBe(boardPos(1).x);
    expect(boardRows(50)).toBe(5);
  });

  it('pages the line where the values grow', () => {
    expect(pageCount(100, 50)).toBe(2);
    expect(pageCount(30, 50)).toBe(1);
    expect(boardPage(50, 50)).toBe(0);
    expect(boardPage(51, 50)).toBe(1);
    expect(pageRange(1, 50, 100)).toEqual({ first: 51, last: 100 });
    expect(pageRange(1, 50, 80)).toEqual({ first: 51, last: 80 });
  });

  it('pulses between full and faint', () => {
    expect(ringPulse(0).scale).toBeCloseTo(1.03);
    expect(ringPulse(0.4).alpha).toBeCloseTo(0.35);
    expect(ringPulse(1.2).scale).toBeCloseTo(1);
  });
});
