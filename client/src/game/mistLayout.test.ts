import { describe, expect, it } from 'vitest';
import { mistBlobs, type MistTile } from './mistLayout';

const TILE: MistTile = { size: 256, count: 24, minR: 0.1, maxR: 0.3, seed: 11 };

describe('mistBlobs', () => {
  const blobs = mistBlobs(TILE);

  it('is the same tile for the same seed', () => {
    expect(mistBlobs(TILE)).toEqual(blobs);
    expect(mistBlobs({ ...TILE, seed: 12 })).not.toEqual(blobs);
  });

  it('only keeps blobs that touch the tile', () => {
    for (const b of blobs) {
      expect(b.x + b.r).toBeGreaterThan(0);
      expect(b.x - b.r).toBeLessThan(TILE.size);
      expect(b.y + b.r).toBeGreaterThan(0);
      expect(b.y - b.r).toBeLessThan(TILE.size);
    }
  });

  it('copies a blob over each edge it crosses, so the tile repeats without seams', () => {
    const s = TILE.size;
    const key = (b: { x: number; y: number }) => `${Math.round(b.x)},${Math.round(b.y)}`;
    const at = new Set(blobs.map(key));
    for (const b of blobs) {
      if (b.x - b.r < 0) expect(at.has(key({ x: b.x + s, y: b.y }))).toBe(true);
      if (b.x + b.r > s) expect(at.has(key({ x: b.x - s, y: b.y }))).toBe(true);
      if (b.y - b.r < 0) expect(at.has(key({ x: b.x, y: b.y + s }))).toBe(true);
      if (b.y + b.r > s) expect(at.has(key({ x: b.x, y: b.y - s }))).toBe(true);
    }
    expect(blobs.length).toBeGreaterThan(TILE.count);
  });
});
