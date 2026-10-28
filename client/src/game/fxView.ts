import { Graphics, Particle, ParticleContainer, Rectangle, Texture, type Renderer } from 'pixi.js';
import { bakeTexture, keepForSession } from './bake';
import { FxPool, fxAlpha, fxSize, type FxParticle, type FxShape } from './fx';
import { SHADOW_Z } from './shadow';
import { alarmFade, type Alarm } from './threat';

// Draws the FxPool through one ParticleContainer: every effect is a tinted particle on a
// small atlas drawn with Graphics at start-up, so effects need no art files and the whole
// layer is one draw call.

const CELL = 64;
/**
 * Clear columns between two cells: a particle scaled up samples half a texel past its frame, so
 * without a gutter a big glow drew the band's solid edge next door as a thin line down its side.
 */
const GUTTER = 4;
const STRIDE = CELL + GUTTER;
const SHAPES: FxShape[] = ['spark', 'puff', 'ring', 'glow', 'band'];
const MAX_PARTICLES = 3000;
/** Particles allocated at start-up: a nova killing ~190 mobs peaks around 1600. */
const PREWARM = 2000;
/**
 * The ground layer (blasts' light, rings and smoke) lies over the shadows and under the fields,
 * the resting gems and every figure (SHADOW_Z + 1 and up).
 */
export const GROUND_FX_Z = SHADOW_Z + 0.75;
/** Particles the ground layer allocates at start-up: Thunder Rain's 18 blasts peak around 700. */
export const GROUND_PREWARM = 800;

/** White shapes side by side, tinted per particle. */
function drawAtlas(renderer: Renderer): Map<FxShape, Texture> {
  const g = new Graphics();
  const h = CELL / 2;
  const x0 = (i: number) => i * STRIDE;
  // spark: a four-point star
  const star: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? h * 0.22 : h * 0.95;
    star.push(h + Math.cos(a) * r, h + Math.sin(a) * r);
  }
  g.poly(star).fill(0xffffff);
  // puff: a soft disc, built from stacked translucent circles
  for (let i = 6; i >= 1; i--) g.circle(x0(1) + h, h, (h * 0.95 * i) / 6).fill({ color: 0xffffff, alpha: 0.22 });
  // ring
  g.circle(x0(2) + h, h, h * 0.8).stroke({ color: 0xffffff, width: h * 0.22 });
  // glow: a disc with a solid core and a stepped falloff
  for (let i = 4; i >= 1; i--) g.circle(x0(3) + h, h, (h * 0.97 * i) / 4).fill({ color: 0xffffff, alpha: i === 1 ? 1 : 0.3 });
  // band: a bar across the whole cell, solid in the middle, so segments join into rings and bolts
  // with 2 px clear above and below: without MSAA a quad's edge only looks smooth when the
  // texture fades to transparent before it. It runs one column on into the gutter before it, so
  // the texel past either end is still the bar and segments meet without a seam (the atlas ends after it).
  const bx = x0(4) - 1;
  g.rect(bx, 2, CELL + 1, CELL - 4).fill({ color: 0xffffff, alpha: 0.35 });
  g.rect(bx, CELL * 0.22, CELL + 1, CELL * 0.56).fill({ color: 0xffffff, alpha: 1 });
  const atlas = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, x0(SHAPES.length - 1) + CELL, CELL), resolution: 1, antialias: true });
  const out = new Map<FxShape, Texture>();
  SHAPES.forEach((s, i) => out.set(s, new Texture({ source: atlas.source, frame: new Rectangle(x0(i), 0, CELL, CELL) })));
  return out;
}

export class FxLayer {
  readonly pool = new FxPool(MAX_PARTICLES);
  readonly hit = (x: number, y: number, dx = 0, dy = 0) => this.pool.hit(x, y, dx, dy);
  readonly puff = (x: number, y: number) => this.pool.puff(x, y);
  readonly down = (x: number, y: number) => this.pool.down(x, y);
  readonly view = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true },
  });
  private readonly textures: Map<FxShape, Texture>;
  private readonly particles: Particle[] = [];
  /** Each particle's tint as last set: Pixi converts the colour (and allocates) on every set. */
  private readonly tints: number[] = [];

  /** `z` in the world: by default in front of every standing figure. */
  constructor(renderer: Renderer, z = 1e7, prewarm = PREWARM) {
    this.textures = keepForSession(renderer, 'fx', () => drawAtlas(renderer));
    this.view.texture = this.textures.get('spark')!;
    this.view.zIndex = z;
    this.pool.prewarm(prewarm);
    this.grow(prewarm);
  }

  private grow(count: number): void {
    while (this.particles.length < count) {
      this.particles.push(new Particle({ texture: this.textures.get('spark')!, anchorX: 0.5, anchorY: 0.5 }));
      this.tints.push(0xffffff);
    }
  }

  /** `extra` are long-lived particles owned elsewhere (auras), drawn after the pool's; `alarm` fades those round the hurt hero. */
  update(dt: number, extra: readonly FxParticle[] = [], alarm?: Alarm): void {
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
      if (this.tints[i] !== f.color) p.tint = this.tints[i] = f.color;
      p.alpha = alarm && alarm.level > 0 ? fxAlpha(f) * alarmFade(alarm.level, f.x - alarm.x, f.y - alarm.y) : fxAlpha(f);
    }
  }
}
