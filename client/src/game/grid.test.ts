import { describe, expect, it } from 'vitest';
import { SpatialGrid } from './grid';

function brute(points: { x: number; y: number }[], x: number, y: number, r: number): number[] {
  return points.flatMap((p, i) => (Math.hypot(p.x - x, p.y - y) < r ? [i] : [])).sort((a, b) => a - b);
}

describe('SpatialGrid', () => {
  it('finds exactly the neighbours a brute-force scan finds', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const points = Array.from({ length: 800 }, () => ({ x: (rand() - 0.5) * 3000, y: (rand() - 0.5) * 3000 }));
    const grid = new SpatialGrid(60);
    grid.build(points);
    const out = new Int32Array(points.length);
    for (let q = 0; q < 200; q++) {
      const { x, y } = points[q];
      const n = grid.near(x, y, out);
      const found = Array.from(out.subarray(0, n)).filter((i) => Math.hypot(points[i].x - x, points[i].y - y) < 60);
      expect(found.sort((a, b) => a - b)).toEqual(brute(points, x, y, 60));
      // no index reported twice
      expect(new Set(out.subarray(0, n)).size).toBe(n);
    }
  });

  it('reuses its buffers across rebuilds of different sizes', () => {
    const grid = new SpatialGrid(10);
    const out = new Int32Array(16);
    grid.build([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 100, y: 100 }]);
    expect(grid.near(0, 0, out)).toBe(2);
    grid.build([{ x: 100, y: 100 }]);
    expect(grid.near(0, 0, out)).toBe(0);
    expect(grid.near(101, 99, out)).toBe(1);
  });
});
