import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { WISPS, hazePulse, wispPose } from './darkWisps';

// The empowered boss's dark aura, drawn behind its figure: a breathing violet haze around the
// body, a dark pool on the ground under its feet and wisps rising off it (timing in
// darkWisps.ts). Cold colours only.

const HAZE = 0x7a3fd6;
const POOL = 0x4a1f8a;
const WISP_COLORS = [0x5a2fa8, 0xa07ef0];

export class DarkAura {
  readonly view = new Container();
  private readonly haze: Sprite;
  private readonly pool: Sprite;
  private readonly wisps: Sprite[] = [];
  private time = 0;

  constructor(renderer: Renderer, private readonly height: number) {
    const tex = blob(renderer);
    this.haze = new Sprite(tex);
    this.haze.anchor.set(0.5);
    this.haze.tint = HAZE;
    this.haze.position.set(0, -height * 0.48);
    this.pool = new Sprite(tex);
    this.pool.anchor.set(0.5);
    this.pool.tint = POOL;
    this.view.addChild(this.pool, this.haze);
    for (let i = 0; i < WISPS; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.tint = WISP_COLORS[i % WISP_COLORS.length];
      this.wisps.push(s);
      this.view.addChild(s);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const h = this.height;
    const k = hazePulse(this.time);
    this.haze.alpha = 0.7 + 0.3 * k;
    this.haze.scale.set((h * (1.0 + 0.08 * k)) / 128, (h * (1.1 + 0.08 * k)) / 128);
    this.pool.alpha = 0.75 + 0.25 * k;
    this.pool.scale.set((h * (1.05 + 0.1 * k)) / 128, (h * (0.32 + 0.03 * k)) / 128);
    for (let i = 0; i < WISPS; i++) {
      const p = wispPose(i, this.time);
      const s = this.wisps[i];
      s.position.set(p.x * h, p.y * h);
      s.alpha = p.alpha;
      s.scale.set((h * 0.3 * p.scale) / 128);
    }
  }
}

/** A white disc fading out to its rim, 128 px across, tinted per use. */
function blob(renderer: Renderer): Texture {
  const r = 64;
  const g = new Graphics();
  for (let i = 10; i >= 1; i--) g.circle(r, r, (r * i) / 10).fill({ color: 0xffffff, alpha: 0.16 });
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, r * 2, r * 2), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}
