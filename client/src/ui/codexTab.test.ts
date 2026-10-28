import { describe, expect, it } from 'vitest';
import { codexCellH, codexHeight, codexWidth } from './codexTab';

// The Codex grid's cells shrink so all its rows and the detail stay above the tab bar.

describe('codexCellH', () => {
  it('keeps the full cell when there is room', () => {
    expect(codexCellH(16, 4000)).toBe(184);
  });

  it('fits sixteen entries and the detail into a 9:16 phone', () => {
    const room = 1920 - 190 - 190 - 20;
    const h = codexCellH(16, room);
    expect(h).toBeLessThan(184);
    expect(codexHeight(16, h)).toBeLessThanOrEqual(room);
  });

  it('never goes below its smallest cell', () => {
    expect(codexCellH(16, 800)).toBe(150);
  });

  it('fits every row beside the detail into the shortest landscape lobby', () => {
    // a 16:9 window's UI frame is 2560x1440; the detail sits beside the grid, not under it
    const room = 1440 - 190 - 190 - 20;
    const h = codexCellH(16, room, true);
    expect(h).toBe(184);
    expect(codexHeight(16, h, true)).toBeLessThanOrEqual(room);
    expect(codexWidth(true)).toBeLessThanOrEqual(2560 - 2 * 120);
  });
});
