import { Container, Graphics, Particle, ParticleContainer, Rectangle, Texture, type Renderer } from 'pixi.js';
import { DropField, OVERFLOW_TIER, type Gem, type GemPalette } from './drops';
import type { FxPool } from './fx';
import { SHADOW_Z } from './shadow';

// Draws the DropField. Gem looks are baked once into textures (thick dark outline, flat fill,
// one light facet, as the sticker art). Resting gems lie on the ground under every figure in
// one ParticleContainer; flying gems pass over the horde in a second one.

/** Fill colours per tier; the last is the overflow gem. */
const COLORS: Record<GemPalette, number[]> = {
  ice: [0x8fe6ff, 0x5fa8ff, 0xb48cff, 0xff4d5e],
  pink: [0xff8ad8, 0xff4fa3, 0xc45cff, 0xff4d5e],
  lime: [0xc6ff5a, 0x6cf07a, 0x2fd6b0, 0xff4d5e],
};
/** Gem height in world units per tier. */
const SIZES = [34, 44, 58, 72];
const OUTLINE = 0x1a1424;
const BAKE_RES = 2;
const PAD = 6;
/** A dropped gem pops out of the corpse: grows in while it hops up and lands. */
const POP_TIME = 0.22;
const POP_HOP = 40;
/** Under the effects, over the horde, just under the elite (HERO_TOP_Z - 1). */
const FLYING_Z = 5e6 - 3;

/** Gem outline in a box of the gem's own size plus padding. */
function gemShape(g: Graphics, ox: number, color: number, h: number, overflow: boolean): number {
  const w = h * (overflow ? 0.9 : 0.7);
  const cx = ox + w / 2 + PAD;
  const top = PAD;
  const mid = PAD + h * 0.38;
  const bot = PAD + h;
  g.poly([cx, top, cx + w / 2, mid, cx, bot, cx - w / 2, mid])
    .fill(color)
    .stroke({ color: OUTLINE, width: 5, join: 'round' })
    // a light upper-left facet and a small glint
    .poly([cx, top + 4, cx - w / 2 + 5, mid, cx, mid])
    .fill({ color: 0xffffff, alpha: 0.45 })
    .circle(cx - w * 0.12, mid - h * 0.12, h * 0.05)
    .fill(0xffffff);
  return w + PAD * 2;
}

/** Every gem look side by side in one texture: a ParticleContainer draws from one source. */
function drawGems(renderer: Renderer, colors: number[]): Texture[] {
  const g = new Graphics();
  const boxes: Rectangle[] = [];
  let x = 0;
  colors.forEach((c, i) => {
    const w = gemShape(g, x, c, SIZES[i], i === OVERFLOW_TIER);
    boxes.push(new Rectangle(x, 0, w, SIZES[i] + PAD * 2));
    x += Math.ceil(w) + 2;
  });
  const h = Math.max(...SIZES) + PAD * 2;
  const atlas = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, x, h), resolution: BAKE_RES, antialias: true });
  g.destroy();
  return boxes.map((b) => new Texture({ source: atlas.source, frame: b }));
}

class GemBatch {
  readonly view = new ParticleContainer({ dynamicProperties: { position: true, vertex: true, uvs: true } });
  private readonly particles: Particle[] = [];
  private count = 0;

  constructor(private readonly textures: Texture[]) {
    this.view.texture = textures[0];
  }

  begin(): void {
    this.count = 0;
  }

  add(g: Gem, x: number, y: number, scale: number): void {
    if (this.particles.length <= this.count) {
      this.particles.push(new Particle({ texture: this.textures[0], anchorX: 0.5, anchorY: 0.85 }));
    }
    const p = this.particles[this.count++];
    p.texture = this.textures[g.tier];
    p.x = x;
    p.y = y;
    p.scaleX = p.scaleY = scale;
  }

  end(): void {
    const kids = this.view.particleChildren;
    if (kids.length === this.count) return;
    kids.length = 0;
    for (let i = 0; i < this.count; i++) kids.push(this.particles[i]);
    this.view.update();
  }
}

export class DropLayer {
  readonly field = new DropField();
  private readonly resting: GemBatch;
  private readonly flying: GemBatch;
  private readonly colors: number[];

  constructor(renderer: Renderer, world: Container, palette: GemPalette, private readonly fx: FxPool) {
    this.colors = COLORS[palette];
    const textures = drawGems(renderer, this.colors);
    this.resting = new GemBatch(textures);
    this.flying = new GemBatch(textures);
    // over the ground and the shadows, under every standing figure and corpse
    this.resting.view.zIndex = SHADOW_Z + 1;
    this.flying.view.zIndex = FLYING_Z;
    world.addChild(this.resting.view, this.flying.view);
  }

  update(dt: number, hx: number, hy: number): void {
    const f = this.field;
    f.step(dt, hx, hy);
    this.resting.begin();
    this.flying.begin();
    // baked textures already measure in world units
    const k = 1;
    for (const g of f.gems) {
      if (g.flying) {
        this.flying.add(g, g.x, g.y, k);
      } else if (g.age < POP_TIME) {
        const t = g.age / POP_TIME;
        this.resting.add(g, g.x, g.y - Math.sin(t * Math.PI) * POP_HOP, k * (0.4 + 0.6 * t));
      } else {
        this.resting.add(g, g.x, g.y, k);
      }
    }
    this.resting.end();
    this.flying.end();
    // one pickup flash a frame is enough, however many gems arrived together
    if (f.picked.length > 0) {
      let tier = 0;
      for (const g of f.picked) tier = Math.max(tier, g.tier);
      this.fx.emit({
        shape: 'ring', x: hx, y: hy - 60, vx: 0, vy: 0, life: 0.2, size0: 30, size1: 90 + tier * 30,
        rotation: 0, spin: 0, drag: 1, color: this.colors[tier], alpha: 0.8,
      }, true);
    }
  }
}
