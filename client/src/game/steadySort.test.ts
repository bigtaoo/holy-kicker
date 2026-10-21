import { describe, expect, it } from 'vitest';
import { sortByZ, sortSteadily } from './steadySort';

const items = (zs: number[]) => zs.map((zIndex, id) => ({ zIndex, id }));

describe('sortByZ', () => {
  it('sorts like a stable Array.sort', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 40; n++) {
      const a = items(Array.from({ length: n * 7 }, () => Math.floor(rand() * 20)));
      const want = [...a].sort((p, q) => p.zIndex - q.zIndex);
      sortByZ(a);
      expect(a).toEqual(want);
    }
  });

  it('keeps equal zIndex in their order', () => {
    const a = items([3, 1, 3, 1]);
    sortByZ(a);
    expect(a.map((x) => x.id)).toEqual([1, 3, 0, 2]);
  });
});

describe('sortSteadily', () => {
  it('sorts only when the order is dirty', () => {
    const c = { children: items([2, 1]), sortableChildren: false, sortDirty: false, sortChildren() {} };
    sortSteadily(c);
    c.sortChildren();
    expect(c.children.map((x) => x.zIndex)).toEqual([2, 1]);
    c.sortDirty = true;
    c.sortChildren();
    expect(c.children.map((x) => x.zIndex)).toEqual([1, 2]);
    expect(c.sortableChildren && !c.sortDirty).toBe(true);
  });
});
