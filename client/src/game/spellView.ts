import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { FP, TICK_RATE, type Field } from '@hk/engine';
import type { FxPool } from './fx';
import { bolt, explosion, fieldMotes, nova, type RingMode } from './spells';
import { SHADOW_Z } from './shadow';

// Spell effects: the build's spells and the area-spell stress test. The engine casts the
// spells and kills what they reach (systems/spells.ts); this draws the casts from its events
// and the lingering fields from its field list.

const NOVA_LIFE = 0.45;

interface FieldSprite {
  sprite: Sprite;
  seen: boolean;
}

function fieldTexture(renderer: Renderer): Texture {
  const r = 128;
  const g = new Graphics()
    .circle(r, r, r * 0.97).fill({ color: 0xffd860, alpha: 0.22 })
    .circle(r, r, r * 0.92).stroke({ color: 0xffe9a0, width: r * 0.07, alpha: 0.9 })
    .circle(r, r, r * 0.6).stroke({ color: 0xffe9a0, width: r * 0.03, alpha: 0.5 });
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, r * 2, r * 2), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

export class SpellView {
  private readonly sprites = new Map<number, FieldSprite>();
  private readonly fieldTex: Texture;

  constructor(
    renderer: Renderer,
    private readonly layer: Container,
    private readonly pool: FxPool,
    private readonly ring: RingMode,
    private readonly rand: () => number = Math.random,
  ) {
    this.fieldTex = fieldTexture(renderer);
  }

  /** A cast at (x, y) with radius r, world units. */
  cast(kind: string, x: number, y: number, r: number): void {
    if (kind === 'nova') nova(this.pool, x, y, 60, r, NOVA_LIFE, 0xfff0b8, this.ring);
    else if (kind === 'meteor') explosion(this.pool, this.rand, x, y, r, this.ring);
  }

  bolt(x0: number, y0: number, x1: number, y1: number): void {
    bolt(this.pool, this.rand, x0, y0, x1, y1);
  }

  /** The sim's lingering fields: a ground disc each, fading in and out, with rising motes. */
  drawFields(fields: readonly Field[], alpha: number, dt: number): void {
    for (const f of this.sprites.values()) f.seen = false;
    for (const f of fields) {
      const r = f.radius / FP;
      const life = f.life / TICK_RATE;
      let s = this.sprites.get(f.id);
      if (!s) {
        const sprite = new Sprite({ texture: this.fieldTex, anchor: 0.5 });
        sprite.scale.set((r * 2) / this.fieldTex.width, (r * 0.9) / this.fieldTex.height);
        sprite.position.set(f.x / FP, f.y / FP);
        sprite.zIndex = SHADOW_Z + 1;
        this.layer.addChild(sprite);
        s = { sprite, seen: false };
        this.sprites.set(f.id, s);
      }
      s.seen = true;
      const age = (f.age + alpha) / TICK_RATE;
      s.sprite.alpha = Math.max(0, Math.min(1, (life - age) / 0.3, age / 0.15));
      fieldMotes(this.pool, this.rand, f.x / FP, f.y / FP, r, Math.round(dt * 60));
    }
    for (const [id, s] of this.sprites) {
      if (s.seen) continue;
      s.sprite.destroy();
      this.sprites.delete(id);
    }
  }
}
