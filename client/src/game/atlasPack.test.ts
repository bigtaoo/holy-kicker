import { describe, expect, it } from 'vitest';
import { gridPack } from './atlasPack';

describe('gridPack', () => {
  it('fills pages row by row', () => {
    const slots = gridPack(700, 800, 7, 2048);
    // 2 columns x 2 rows per page
    expect(slots.slice(0, 5)).toEqual([
      { page: 0, x: 0, y: 0 },
      { page: 0, x: 700, y: 0 },
      { page: 0, x: 0, y: 800 },
      { page: 0, x: 700, y: 800 },
      { page: 1, x: 0, y: 0 },
    ]);
    expect(slots[6].page).toBe(1);
  });

  it('rejects a sheet bigger than the page', () => {
    expect(() => gridPack(1100, 900, 1, 1024)).toThrow();
  });
});
