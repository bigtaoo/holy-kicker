import { describe, expect, it } from 'vitest';
import type { Renderer, Texture } from 'pixi.js';
import { bakeTexture, bakedCount, releaseBaked } from './bake';

function fakeRenderer() {
  const destroyed: number[] = [];
  let made = 0;
  const renderer = {
    generateTexture: () => {
      const id = made++;
      return { id, destroy: () => destroyed.push(id) } as unknown as Texture;
    },
  } as unknown as Renderer;
  return { renderer, destroyed };
}

describe('baked textures', () => {
  it('frees every texture a run baked, once, and only on its own renderer', () => {
    const a = fakeRenderer();
    const b = fakeRenderer();
    bakeTexture(a.renderer, { target: null as never });
    bakeTexture(a.renderer, { target: null as never });
    bakeTexture(b.renderer, { target: null as never });
    expect(bakedCount(a.renderer)).toBe(2);
    releaseBaked(a.renderer);
    expect(a.destroyed).toEqual([0, 1]);
    expect(b.destroyed).toEqual([]);
    expect(bakedCount(a.renderer)).toBe(0);
    releaseBaked(a.renderer);
    expect(a.destroyed).toEqual([0, 1]);
    expect(bakedCount(b.renderer)).toBe(1);
  });
});
