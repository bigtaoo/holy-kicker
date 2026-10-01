import { Graphics, Particle, ParticleContainer, Rectangle, Texture, type Renderer } from 'pixi.js';
import { FxPool, fxAlpha, fxSize, type FxParticle, type FxShape } from './fx';

// Draws the FxPool through one ParticleContainer: every effect is a tinted particle on a
// small atlas drawn with Graphics at start-up, so effects need no art files and the whole
// layer is one draw call.

const CELL = 64;
const SHAPES: FxShape[] = ['spark', 'puff', 'ring', 'glow', 'band'];
const MAX_PARTICLES = 3000;
/** Particles allocated at start-up: a nova killing ~190 mobs peaks around 1600. */
const PREWARM = 2000;

/** White shapes side by side, tinted per particle. */
function drawAtlas(renderer: Renderer): Map<FxShape, Texture> {
  const g = new Graphics();
  const h = CELL / 2;
  // spark: a four-point star
  const star: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? h * 0.22 : h * 0.95;
    star.push(h + Math.cos(a) * r, h + Math.sin(a) * r);
  }
  g.poly(star).fill(0xffffff);
  // puff: a soft disc, built from stacked translucent circles
  for (let i = 6; i >= 1; i--) g.circle(CELL + h, h, (h * 0.95 * i) / 6).fill({ color: 0xffffff, alpha: 0.22 });
  // ring
  g.circle(CELL * 2 + h, h, h * 0.8).stroke({ color: 0xffffff, width: h * 0.22 });
  // glow: a disc with a solid core and a stepped falloff
  for (let i = 4; i >= 1; i--) g.circle(CELL * 3 + h, h, (h * 0.97 * i) / 4).fill({ color: 0xffffff, alpha: i === 1 ? 1 : 0.3 });
  // band: a bar across the whole cell, solid in the middle, so segments join into rings and bolts
  // with 2 px clear above and below: without MSAA a quad's edge only looks smooth when the
  // texture fades to transparent before it
  g.rect(CELL * 4, 2, CELL, CELL - 4).fill({ color: 0xffffff, alpha: 0.35 });
  g.rect(CELL * 4, CELL * 0.22, CELL, CELL * 0.56).fill({ color: 0xffffff, alpha: 1 });
  const atlas = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, CELL * SHAPES.length, CELL), resolution: 1, antialias: true });
  g.destroy();
  const out = new Map<FxShape, Texture>();
  SHAPES.forEach((s, i) => out.set(s, new Texture({ source: atlas.source, frame: new Rectangle(i * CELL, 0, CELL, CELL) })));
  return out;
}

export class FxLayer {
  readonly pool = new FxPool(MAX_PARTICLES);
  readonly hit = (x: number, y: number) => this.pool.hit(x, y);
  readonly puff = (x: number, y: number) => this.pool.puff(x, y);
  readonly view = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true },
  });
  private readonly textures: Map<FxShape, Texture>;
  private readonly particles: Particle[] = [];

  constructor(renderer: Renderer) {
    this.textures = drawAtlas(renderer);
    this.view.texture = this.textures.get('spark')!;
    // in front of every standing figure
    this.view.zIndex = 1e7;
    this.pool.prewarm(PREWARM);
    this.grow(PREWARM);
  }

  private grow(count: number): void {
    while (this.particles.length < count) {
      this.particles.push(new Particle({ texture: this.textures.get('spark')!, anchorX: 0.5, anchorY: 0.5 }));
    }
  }

  /** `extra` are long-lived particles owned elsewhere (auras), drawn after the pool's. */
  update(dt: number, extra: readonly FxParticle[] = []): void {
    this.pool.step(dt);
    const live = this.pool.live;
    const count = live.length + extra.length;
    this.grow(count);
    if (this.view.particleChildren.length !== count) {
      this.view.particleChildren.length = 0;
      for (let i = 0; i < count; i++) this.view.particleChildren.push(this.particles[i]);
      this.view.update();
    }
    for (let i = 0; i < count; i++) {
      const f = i < live.length ? live[i] : extra[i - live.length];
      const p = this.particles[i];
      p.texture = this.textures.get(f.shape)!;
      p.x = f.x;
      p.y = f.y;
      p.rotation = f.rotation;
      p.scaleX = fxSize(f) / CELL;
      p.scaleY = p.scaleX * f.aspect;
      p.tint = f.color;
      p.alpha = fxAlpha(f);
    }
  }
}
