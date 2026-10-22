import { describe, expect, it } from 'vitest';
import { ImageSource, Texture, TextureSource, type Renderer } from 'pixi.js';
import { textureSources, warmTextures } from './gpuWarm';

describe('textureSources', () => {
  it('finds each source once through objects, arrays and maps, and skips destroyed ones', () => {
    const a = new TextureSource({ width: 4, height: 4 });
    const b = new TextureSource({ width: 4, height: 4 });
    const gone = new TextureSource({ width: 4, height: 4 });
    gone.destroy();
    const frame = new Texture({ source: a });
    const art: Record<string, unknown> = { hero: { atlas: frame, bones: [{ name: 'arm' }] }, mobs: [frame, new Texture({ source: a })], icons: new Map([['x', new Texture({ source: b })]]), old: gone, none: null };
    art.self = art;
    expect([...textureSources(art)]).toEqual([a, b]);
  });

  it('uploads what is not on the GPU yet and keeps all of it out of the texture GC', () => {
    const fresh = new ImageSource({ width: 4, height: 4 });
    const up = new ImageSource({ width: 4, height: 4 });
    const renderer = { uid: 7, texture: { initSource: (s: TextureSource) => (s._gpuData[7] = {} as never) } } as unknown as Renderer;
    up._gpuData[7] = {} as never;
    expect([fresh.autoGarbageCollect, up.autoGarbageCollect]).toEqual([true, true]);
    expect(warmTextures(renderer, [new Texture({ source: fresh }), new Texture({ source: up })])).toBe(1);
    expect([fresh.autoGarbageCollect, up.autoGarbageCollect]).toEqual([false, false]);
  });
});
