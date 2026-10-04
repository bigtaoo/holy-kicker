import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import type { Bowl } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import { makeShadow } from './shadow';

// The alms bowl relic (engine systems/bowl.ts): thrown bowls in flight, drawn from the sim's
// bowl list as a spinning bowl seen from above over a ground shadow. The mobs it drags are
// ordinary mobs the sim moves along with it. The Bottomless Bowl's opening is a dark void.

/** Drawn this far above its ground point. */
const LIFT = 45;
const SIZE = 120;
const OUTLINE = 0x3a2410;
const LOOKS = [
  { body: 0x9a5a2a, shade: 0x6e3c1a, inside: 0x4a2812 },
  { body: 0x9a5a2a, shade: 0x6e3c1a, inside: 0x1c0e26 },
];
const RIM = 0xf0b030;

function bowlTexture(renderer: Renderer, look: (typeof LOOKS)[number]): Texture {
  const r = SIZE / 2;
  const g = new Graphics()
    .circle(r, r, r - 1).fill(OUTLINE)
    .circle(r, r, r - 7).fill(look.body)
    // one hard cel shadow on the lower right of the outer wall
    .arc(r, r, r - 7, -0.3, Math.PI * 0.85).arc(r - 7, r - 7, r - 9, Math.PI * 0.85, -0.3, true).fill(look.shade)
    .circle(r, r, r - 18).fill(RIM)
    .circle(r, r, r - 24).fill(OUTLINE)
    .circle(r, r, r - 28).fill(look.inside)
    .ellipse(r - 26, r - 30, 9, 5).fill(0xffffff);
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, SIZE, SIZE), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

interface Flight {
  sprite: Sprite;
  shadow: Sprite;
  seen: boolean;
}

export class BowlView {
  private readonly textures: Texture[];
  private readonly live = new Map<number, Flight>();

  constructor(renderer: Renderer, private readonly layer: Container, private readonly shadowTex: Texture) {
    this.textures = LOOKS.map((l) => bowlTexture(renderer, l));
  }

  sync(bowls: readonly Bowl[], alpha: number, dt: number): void {
    for (const f of this.live.values()) f.seen = false;
    for (const b of bowls) {
      let f = this.live.get(b.id);
      if (!f) {
        const sprite = new Sprite({ texture: this.textures[b.swallow ? 1 : 0], anchor: 0.5 });
        f = { sprite, shadow: makeShadow(this.shadowTex, SIZE * 0.4, SIZE * 0.14), seen: false };
        this.layer.addChild(f.shadow, sprite);
        this.live.set(b.id, f);
      }
      f.seen = true;
      const x = lerpX(b, alpha);
      const y = lerpY(b, alpha);
      f.sprite.position.set(x, y - LIFT);
      f.sprite.rotation += dt * 9;
      // over the mobs it carries
      f.sprite.zIndex = y + 60;
      f.shadow.position.set(x, y);
    }
    for (const [id, f] of this.live) {
      if (f.seen) continue;
      f.sprite.destroy();
      f.shadow.destroy();
      this.live.delete(id);
    }
  }
}
