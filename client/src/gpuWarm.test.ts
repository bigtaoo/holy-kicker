import { describe, expect, it } from 'vitest';
import { Texture, TextureSource } from 'pixi.js';
import { textureSources } from './gpuWarm';

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
});
