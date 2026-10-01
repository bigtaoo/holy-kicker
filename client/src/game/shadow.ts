import { Graphics, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';

// Ground shadows: one shared disc texture stretched into an ellipse per figure. As sprites
// they batch with the figures around them, where a Graphics per shadow would not.

const R = 64;
/** Shadows draw under every standing figure. */
export const SHADOW_Z = -1e6;

export function shadowTexture(renderer: Renderer): Texture {
  const g = new Graphics().circle(R, R, R).fill({ color: 0x000000, alpha: 0.3 });
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, R * 2, R * 2), resolution: 1 });
  g.destroy();
  return tex;
}

export function makeShadow(tex: Texture, rx: number, ry: number): Sprite {
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  sizeShadow(s, rx, ry);
  s.zIndex = SHADOW_Z;
  return s;
}

/** Half-width and half-height in world units, times `k`. */
export function sizeShadow(s: Sprite, rx: number, ry: number, k = 1): void {
  s.scale.set((rx / R) * k, (ry / R) * k);
}
