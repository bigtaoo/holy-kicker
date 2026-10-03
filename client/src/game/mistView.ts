import { Container, Graphics, Rectangle, TilingSprite, type Renderer, type Texture } from 'pixi.js';
import { mistBlobs, type MistTile } from './mistLayout';
import { SHADOW_Z } from './shadow';

// Low mist lying on a stage's ground: a few soft tiles baked in code at start-up (no art to
// ship), each repeating over the field and drifting with the wind, slowly breathing in and out.
// It sits over the ground and its props but under every shadow and figure, so the hazards and
// the horde stay as readable as on a clear stage.

export interface MistLayer {
  tile: MistTile;
  /** World units one tile covers. */
  span: number;
  tint: number;
  alpha: number;
  /** Drift in world units per second. */
  vx: number;
  vy: number;
  /** Seconds per breath; the layer's opacity swings by a quarter over it. */
  breath: number;
}

/** Chapter 2's misty marsh: a broad pale bank drifting one way and smaller wisps the other. */
export const MARSH_MIST: readonly MistLayer[] = [
  { tile: { size: 256, count: 7, minR: 0.14, maxR: 0.3, seed: 5 }, span: 2400, tint: 0xc4ded6, alpha: 0.26, vx: 28, vy: 8, breath: 11 },
  { tile: { size: 256, count: 10, minR: 0.06, maxR: 0.14, seed: 23 }, span: 1500, tint: 0xd8ece6, alpha: 0.18, vx: -42, vy: 12, breath: 7 },
];

/** Rings per blob: enough that the steps of its falloff never show. */
const RINGS = 14;
const FIELD = 4000;

export class Mist {
  readonly view = new Container();
  private readonly sprites: TilingSprite[] = [];
  private time = 0;

  constructor(renderer: Renderer, private readonly layers: readonly MistLayer[]) {
    for (const l of layers) {
      const s = new TilingSprite({ texture: bakeTile(renderer, l), width: FIELD * 2, height: FIELD * 2 });
      s.position.set(-FIELD, -FIELD);
      s.tileScale.set(l.span / l.tile.size);
      s.tint = l.tint;
      this.sprites.push(s);
      this.view.addChild(s);
    }
    this.view.zIndex = SHADOW_Z - 0.5;
  }

  update(dt: number): void {
    this.time += dt;
    this.layers.forEach((l, i) => {
      const s = this.sprites[i];
      s.tilePosition.x = (this.time * l.vx) % l.span;
      s.tilePosition.y = (this.time * l.vy) % l.span;
      s.alpha = l.alpha * (0.875 + 0.125 * Math.sin((this.time / l.breath) * Math.PI * 2 + i));
    });
  }
}

function bakeTile(renderer: Renderer, l: MistLayer): Texture {
  const g = new Graphics();
  for (const b of mistBlobs(l.tile)) {
    // equal rings that pile up to the blob's peak at its centre
    const k = 1 - Math.pow(1 - b.a, 1 / RINGS);
    for (let i = RINGS; i >= 1; i--) g.circle(b.x, b.y, (b.r * i) / RINGS).fill({ color: 0xffffff, alpha: k });
  }
  const size = l.tile.size;
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, size, size), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}
