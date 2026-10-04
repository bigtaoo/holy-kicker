import { Graphics, Rectangle, Sprite, TilingSprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import type { DecoSheet, DecoStyle } from './decoView';
import type { MistLayer } from './mistView';
import { SHADOW_Z } from './shadow';

// Stage pieces the game scene is built from: the ground, rings under figures, the hero's dark
// backing, the touch stick, and the hero's hurt tint.

const GROUND = 0x3a4a3c;
const TUFT = 0x2f3e31;
const FIELD = 4000;
/** World units per ground tile pixel. */
const GROUND_SCALE = 1.5;

/** A chapter's ground: the repeating tile (null draws the flat placeholder field), the
 * decorations scattered over it (null when the scene turns them off) and its low mist, if any. */
export interface StageArt {
  ground: Texture | null;
  deco: DecoSheet | null;
  style: DecoStyle;
  mist: readonly MistLayer[] | null;
}

/** White at 0, a soft red at 1. */
export function hurtTint(k: number): number {
  const gb = Math.round(255 - 130 * k);
  return 0xff0000 | (gb << 8) | gb;
}

/** Flat field with scattered grass tufts, so movement is visible. */
export function makeGround(): Graphics {
  const g = new Graphics();
  g.rect(-FIELD, -FIELD, FIELD * 2, FIELD * 2).fill(GROUND);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    g.rect(-FIELD + rand() * FIELD * 2, -FIELD + rand() * FIELD * 2, 14 + rand() * 10, 8).fill(TUFT);
  }
  g.zIndex = -Infinity;
  return g;
}

export function makeTiledGround(tex: Texture): TilingSprite {
  const g = new TilingSprite({ texture: tex, width: FIELD * 2, height: FIELD * 2 });
  g.position.set(-FIELD, -FIELD);
  g.tileScale.set(GROUND_SCALE);
  g.zIndex = -Infinity;
  return g;
}

// Rings and the stick are baked into textures with MSAA on the render target: phones run
// without MSAA on the screen, where Graphics edges would come out jagged.

/** A flat ring on the ground around a figure's feet, optionally over a dark outline. */
export function makeRing(renderer: Renderer, color: number, size = 1, outline = false): Sprite {
  const rx = 62 * size;
  const ry = 22 * size;
  const g = new Graphics();
  if (outline) g.ellipse(rx + 6, ry + 6, rx, ry).stroke({ color: 0x140c18, width: 11, alpha: 0.6 });
  g.ellipse(rx + 6, ry + 6, rx, ry).stroke({ color, width: 6, alpha: outline ? 1 : 0.8 });
  const s = new Sprite(bake(renderer, g, rx * 2 + 12, ry * 2 + 12, 1));
  s.anchor.set(0.5);
  s.zIndex = SHADOW_Z;
  return s;
}

/** A soft dark glow behind the hero's figure, so he stands out on bright spells. */
export function heroBacking(renderer: Renderer, heroHeight: number): Sprite {
  const w = 90;
  const h = 110;
  const g = new Graphics();
  for (let i = 8; i >= 1; i--) g.ellipse(w, h, (w * i) / 8, (h * i) / 8).fill({ color: 0x140c18, alpha: 0.11 });
  const s = new Sprite(bake(renderer, g, w * 2, h * 2, 1));
  s.anchor.set(0.5);
  // centred on his chest; he is drawn from his feet
  s.y = -heroHeight / 2;
  return s;
}

export function stickSprites(renderer: Renderer, radius: number): [Sprite, Sprite] {
  const r = radius;
  const k = r * 0.45;
  const res = renderer.resolution;
  const base = new Graphics().circle(r + 3, r + 3, r).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ color: 0xffffff, alpha: 0.35, width: 3 });
  const knob = new Graphics().circle(k + 2, k + 2, k).fill({ color: 0xffffff, alpha: 0.4 });
  return [bake(renderer, base, r * 2 + 6, r * 2 + 6, res), bake(renderer, knob, k * 2 + 4, k * 2 + 4, res)].map((t) => {
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.visible = false;
    return s;
  }) as [Sprite, Sprite];
}

function bake(renderer: Renderer, g: Graphics, w: number, h: number, resolution: number): Texture {
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, w, h), resolution, antialias: true });
  g.destroy();
  return tex;
}
