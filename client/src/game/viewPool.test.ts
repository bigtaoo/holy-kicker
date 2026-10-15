import { describe, expect, it } from 'vitest';
import { ViewPool } from './viewPool';

describe('ViewPool', () => {
  it('makes and places only as many as were ever shown at once', () => {
    const placed: { visible: boolean }[] = [];
    const pool = new ViewPool(() => ({ visible: false }), (v) => placed.push(v));
    const a = pool.take();
    const b = pool.take();
    expect(a.visible && b.visible).toBe(true);
    pool.give(a);
    expect(a.visible).toBe(false);
    expect(pool.take()).toBe(a);
    pool.give(a);
    pool.give(b);
    pool.take();
    pool.take();
    expect(pool.made).toBe(2);
    expect(placed).toHaveLength(2);
  });
});
