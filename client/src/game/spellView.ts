import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { FP, TICK_RATE, type Cymbal, type Field } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import type { FxPool } from './fx';
import { bolt, explosion, fieldMotes, nova, type RingMode } from './spells';
import { SHADOW_Z } from './shadow';

// Spell effects: the build's spells and the area-spell stress test. The engine casts the
// spells and kills what they reach (systems/spells.ts); this draws the casts from its events,
// the lingering fields and flying cymbals from its lists, and the Golden Bell over the hero.

const NOVA_LIFE = 0.45;
/** Cymbals fly at chest height. */
const CYMBAL_LIFT = 50;
const BELL_R = 115;
/** The bell pops up over this many seconds. */
const BELL_POP = 0.2;

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

function cymbalTexture(renderer: Renderer): Texture {
  const r = 64;
  const g = new Graphics()
    .circle(r, r, r * 0.92).fill(0xe0b040).stroke({ color: 0x3a2410, width: r * 0.12 })
    .circle(r, r, r * 0.55).stroke({ color: 0xffe9a0, width: r * 0.1 })
    .circle(r, r, r * 0.2).fill(0x8a5a18)
    .moveTo(r * 0.45, r * 0.4).lineTo(r * 0.75, r * 0.55).stroke({ color: 0xffffff, width: r * 0.1, alpha: 0.8 });
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, r * 2, r * 2), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

/** The Golden Bell: a see-through golden dome with a rim, drawn around the hero. */
function bellDome(): Graphics {
  const r = BELL_R;
  return new Graphics()
    .ellipse(0, 0, r, r * 1.15).fill({ color: 0xffd860, alpha: 0.18 })
    .ellipse(0, 0, r, r * 1.15).stroke({ color: 0xffe9a0, width: 9, alpha: 0.85 })
    .ellipse(0, r * 0.75, r * 0.82, r * 0.22).stroke({ color: 0xffe9a0, width: 6, alpha: 0.6 })
    .ellipse(-r * 0.4, -r * 0.5, r * 0.14, r * 0.28).fill({ color: 0xffffff, alpha: 0.5 });
}

export class SpellView {
  private readonly sprites = new Map<number, FieldSprite>();
  private readonly fieldTex: Texture;
  private readonly cymbalTex: Texture;
  private readonly cymbals = new Map<number, FieldSprite>();
  private readonly bell = bellDome();
  private bellT = BELL_POP;

  constructor(
    renderer: Renderer,
    private readonly layer: Container,
    private readonly pool: FxPool,
    private readonly ring: RingMode,
    private readonly rand: () => number = Math.random,
  ) {
    this.fieldTex = fieldTexture(renderer);
    this.cymbalTex = cymbalTexture(renderer);
    this.bell.visible = false;
    layer.addChild(this.bell);
  }

  /** The local hero's bell came up: it pops into place. */
  bellUp(): void {
    this.bellT = 0;
  }

  /** The bell over the hero at (x, y) while it is up; zIndex just above the hero. */
  drawBell(up: boolean, x: number, y: number, z: number, dt: number): void {
    this.bell.visible = up;
    if (!up) return;
    this.bellT = Math.min(BELL_POP, this.bellT + dt);
    const pop = this.bellT / BELL_POP;
    const breathe = 1 + 0.03 * Math.sin(performance.now() / 220);
    this.bell.scale.set((0.6 + 0.4 * pop) * breathe);
    this.bell.alpha = pop;
    this.bell.position.set(x, y - 60);
    this.bell.zIndex = z + 0.5;
  }

  /** The sim's flying cymbals: spinning discs, interpolated between ticks. */
  drawCymbals(cymbals: readonly Cymbal[], alpha: number, dt: number): void {
    for (const c of this.cymbals.values()) c.seen = false;
    for (const c of cymbals) {
      let v = this.cymbals.get(c.id);
      if (!v) {
        const sprite = new Sprite({ texture: this.cymbalTex, anchor: 0.5 });
        sprite.scale.set((c.radius / FP) * 1.3 / this.cymbalTex.width);
        this.layer.addChild(sprite);
        v = { sprite, seen: false };
        this.cymbals.set(c.id, v);
      }
      v.seen = true;
      const y = lerpY(c, alpha);
      v.sprite.position.set(lerpX(c, alpha), y - CYMBAL_LIFT);
      v.sprite.rotation += dt * 18;
      v.sprite.zIndex = y + 1;
      // fade out over the last few ticks
      v.sprite.alpha = Math.min(1, (c.life - c.age) / 4);
    }
    for (const [id, v] of this.cymbals) {
      if (v.seen) continue;
      v.sprite.destroy();
      this.cymbals.delete(id);
    }
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
