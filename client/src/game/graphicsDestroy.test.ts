import { describe, expect, it } from 'vitest';
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { patchGraphicsDestroy } from './graphicsDestroy';

patchGraphicsDestroy();

describe('Graphics.destroy', () => {
  it('frees the context a graphic made for itself when a tree is destroyed with options', () => {
    const root = new Container();
    const g = root.addChild(new Graphics().rect(0, 0, 10, 10).fill(0xffffff));
    const ctx = g.context;
    root.destroy({ children: true });
    expect(ctx.destroyed).toBe(true);
  });

  it('still frees it with no options, and only once', () => {
    const g = new Graphics().circle(0, 0, 5).fill(0xffffff);
    const ctx = g.context;
    g.destroy();
    expect(ctx.destroyed).toBe(true);
  });

  it('leaves a shared context to its other users', () => {
    const shared = new GraphicsContext().circle(0, 0, 5).fill(0xffffff);
    const a = new Graphics(shared);
    const b = new Graphics(shared);
    a.destroy({ children: true });
    expect(shared.destroyed).toBe(false);
    const clone = b.clone();
    b.destroy({ children: true });
    expect(shared.destroyed).toBe(false);
    clone.destroy();
    expect(shared.destroyed).toBe(false);
  });

  it('is patched once, however often it is called', () => {
    const before = Graphics.prototype.destroy;
    patchGraphicsDestroy();
    expect(Graphics.prototype.destroy).toBe(before);
  });
});
