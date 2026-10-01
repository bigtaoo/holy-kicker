import { Container, Particle, ParticleContainer, Rectangle, Text, Texture, type Renderer } from 'pixi.js';
import { DamagePool, damageAlpha, damageScale } from './damage';

// Draws the DamagePool through one ParticleContainer, one particle per digit. The ten digit
// glyphs are rendered once at start-up with the canvas font into a small atlas (white fill,
// dark outline), so numbers never rebuild text textures and the layer stays one draw call.

const FONT_SIZE = 72;
const STROKE = 12;
const MAX_NUMBERS = 1500;
/** Numbers (of about three digits) allocated at start-up. */
const PREWARM = 300;
/** Height of a normal number in world units. */
const HEIGHT = 52;
const NORMAL = 0xffffff;
const CRIT = 0xffc83a;

interface Glyphs {
  textures: Texture[];
  /** Digit spacing and glyph height, atlas px. */
  advance: number;
  height: number;
}

function drawGlyphs(renderer: Renderer): Glyphs {
  const style = {
    fontFamily: 'Arial', fontWeight: 'bold' as const, fontSize: FONT_SIZE, fill: 0xffffff,
    stroke: { color: 0x1a1424, width: STROKE, join: 'round' as const },
  };
  const glyphs = Array.from('0123456789', (c) => new Text({ text: c, style, resolution: 1 }));
  const w = Math.ceil(Math.max(...glyphs.map((g) => g.width)));
  const h = Math.ceil(Math.max(...glyphs.map((g) => g.height)));
  const box = new Container();
  glyphs.forEach((g, i) => {
    g.x = i * w + (w - g.width) / 2;
    box.addChild(g);
  });
  const atlas = renderer.generateTexture({ target: box, frame: new Rectangle(0, 0, w * 10, h), resolution: 1 });
  box.destroy({ children: true });
  const textures = glyphs.map((_, i) => new Texture({ source: atlas.source, frame: new Rectangle(i * w, 0, w, h) }));
  // neighbouring outlines overlap a little, as in a hand-lettered number
  return { textures, advance: w - STROKE * 0.9, height: h };
}

export class DamageLayer {
  readonly pool = new DamagePool(MAX_NUMBERS);
  readonly spawn = (x: number, y: number, value: number, crit: boolean) => this.pool.spawn(x, y, value, crit);
  readonly view = new ParticleContainer({
    dynamicProperties: { position: true, vertex: true, color: true, uvs: true },
  });
  private readonly glyphs: Glyphs;
  private readonly particles: Particle[] = [];

  constructor(renderer: Renderer) {
    this.glyphs = drawGlyphs(renderer);
    this.view.texture = this.glyphs.textures[0];
    // above the effects
    this.view.zIndex = 1e7 + 1;
    this.pool.prewarm(PREWARM);
    while (this.particles.length < PREWARM * 3) {
      this.particles.push(new Particle({ texture: this.glyphs.textures[0], anchorX: 0.5, anchorY: 1 }));
    }
  }

  update(dt: number): void {
    this.pool.step(dt);
    const live = this.pool.live;
    let count = 0;
    for (const d of live) count += d.digits.length;
    const { textures, advance, height } = this.glyphs;
    while (this.particles.length < count) {
      this.particles.push(new Particle({ texture: textures[0], anchorX: 0.5, anchorY: 1 }));
    }
    if (this.view.particleChildren.length !== count) {
      this.view.particleChildren.length = 0;
      for (let i = 0; i < count; i++) this.view.particleChildren.push(this.particles[i]);
      this.view.update();
    }
    let k = 0;
    for (const d of live) {
      const s = (damageScale(d) * HEIGHT) / height;
      const step = advance * s;
      const n = d.digits.length;
      const x0 = d.x - ((n - 1) * step) / 2;
      const tint = d.crit ? CRIT : NORMAL;
      const alpha = damageAlpha(d);
      for (let j = 0; j < n; j++) {
        const p = this.particles[k++];
        p.texture = textures[d.digits[j]];
        p.x = x0 + j * step;
        p.y = d.y;
        p.scaleX = p.scaleY = s;
        p.tint = tint;
        p.alpha = alpha;
      }
    }
  }
}
