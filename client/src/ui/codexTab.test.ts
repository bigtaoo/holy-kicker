import { describe, expect, it } from 'vitest';
import { codexCellH, codexHeight } from './codexTab';

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
});
