import { describe, expect, it } from 'vitest';
import type { Container, Renderer, Texture } from 'pixi.js';
import { bakeTexture, bakedCount, keepForSession, rebake, releaseBaked } from './bake';

function fakeRenderer() {
  const destroyed: number[] = [];
  const targets: string[] = [];
  const drawn: number[] = [];
  let changed: (() => void) | undefined;
  let made = 0;
  const renderer = {
    generateTexture: () => {
      const id = made++;
      return { id, destroy: () => destroyed.push(id), source: { updateMipmaps: () => {} } } as unknown as Texture;
    },
    render: ({ target }: { target: { id: number } }) => drawn.push(target.id),
    runners: { contextChange: { add: (o: { contextChange: () => void }) => (changed = o.contextChange) } },
  } as unknown as Renderer;
  const target = (name: string) => ({ destroy: () => targets.push(name) }) as unknown as Container;
  return { renderer, destroyed, targets, drawn, target, restore: () => changed?.() };
}

describe('baked textures', () => {
  it('frees every texture a run baked, with its container, once, and only on its own renderer', () => {
    const a = fakeRenderer();
    const b = fakeRenderer();
    bakeTexture(a.renderer, { target: a.target('x') });
    bakeTexture(a.renderer, { target: a.target('y') });
    bakeTexture(b.renderer, { target: b.target('z') });
    expect(bakedCount(a.renderer).run).toBe(2);
    releaseBaked(a.renderer);
    expect(a.destroyed).toEqual([0, 1]);
    expect(a.targets).toEqual(['x', 'y']);
    expect(b.destroyed).toEqual([]);
    expect(bakedCount(a.renderer).run).toBe(0);
    releaseBaked(a.renderer);
    expect(a.destroyed).toEqual([0, 1]);
    expect(bakedCount(b.renderer).run).toBe(1);
  });

  it('keeps session bakes across runs and bakes each key once', () => {
    const a = fakeRenderer();
    const make = () => bakeTexture(a.renderer, { target: a.target('shadow') });
    const first = keepForSession(a.renderer, 'shadow', make);
    bakeTexture(a.renderer, { target: a.target('run') });
    releaseBaked(a.renderer);
    expect(keepForSession(a.renderer, 'shadow', make)).toBe(first);
    expect(a.destroyed).toEqual([1]);
    expect(bakedCount(a.renderer)).toEqual({ run: 0, session: 1 });
  });

  it('draws every bake again when the context comes back', () => {
    const a = fakeRenderer();
    keepForSession(a.renderer, 'fx', () => bakeTexture(a.renderer, { target: a.target('fx') }));
    bakeTexture(a.renderer, { target: a.target('run') });
    a.restore();
    expect(a.drawn).toEqual([0, 1]);
    rebake(a.renderer);
    expect(a.drawn).toEqual([0, 1, 0, 1]);
  });
});
