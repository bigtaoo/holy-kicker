import { describe, expect, it } from 'vitest';
import { countNodes, textureStats } from './memProbe';

describe('countNodes', () => {
  it('counts the root and everything under it', () => {
    expect(countNodes({})).toBe(1);
    expect(countNodes({ children: [{}, { children: [{}, {}] }] })).toBe(5);
  });

  it('walks a very deep tree', () => {
    let root = {};
    for (let i = 0; i < 100_000; i++) root = { children: [root] };
    expect(countNodes(root)).toBe(100_001);
  });
});

describe('textureStats', () => {
  it('counts sources and their size at 4 bytes a pixel', () => {
    expect(textureStats([])).toEqual({ tex: 0, texMB: 0 });
    expect(textureStats([{ pixelWidth: 1024, pixelHeight: 1024 }, { pixelWidth: 2048, pixelHeight: 1024 }])).toEqual({ tex: 2, texMB: 12 });
    // Pixi leaves a null where it unloaded a texture
    expect(textureStats([null, { pixelWidth: 1024, pixelHeight: 1024 }, undefined])).toEqual({ tex: 1, texMB: 4 });
  });
});
