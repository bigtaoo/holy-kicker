import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { bakeTexture } from './bake';
import { FP, TICK_RATE, type Cymbal, type Field, type SimEvent } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import type { FxPool } from './fx';
import { PalmFalls } from './palmView';
import { bolt, explosion, fieldMotes, nova, type RingMode } from './spells';
import { SHADOW_Z } from './shadow';

// Spell effects: the build's spells and the area-spell stress test. The engine casts the
// spells and kills what they reach (systems/spells.ts); this draws the casts from its events,
// the lingering fields and flying cymbals from its lists, and the Golden Bell over the hero.
// Evolved forms: the Mountain Palm's print, a jade Healing Incense ring, the Golden Body's
// guard (the dome flickers while the hero is untouchable) and the Cymbal Wheel's cymbals,
// which never fade.

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

const FIELD_R = 128;

function bake(renderer: Renderer, g: Graphics, size: number): Texture {
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, size, size), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

function fieldTexture(renderer: Renderer, fill: number, rim: number): Texture {
  const r = FIELD_R;
  const g = new Graphics()
    .circle(r, r, r * 0.97).fill({ color: fill, alpha: 0.22 })
    .circle(r, r, r * 0.92).stroke({ color: rim, width: r * 0.07, alpha: 0.9 })
    .circle(r, r, r * 0.6).stroke({ color: rim, width: r * 0.03, alpha: 0.5 });
  return bake(renderer, g, r * 2);
}

/** The Mountain Palm's print: a golden hand pressed into the ground, fingers up. */
function printTexture(renderer: Renderer): Texture {
  const r = FIELD_R;
  const g = new Graphics().circle(r, r, r * 0.97).fill({ color: 0xffd860, alpha: 0.16 });
  const hand = { color: 0xffd860, alpha: 0.55 };
  const edge = { color: 0x8a5a18, width: r * 0.04, alpha: 0.8 };
  g.ellipse(r, r * 1.22, r * 0.44, r * 0.4).fill(hand).stroke(edge);
  // four fingers and a thumb as rounded bars
  const fingers: [number, number, number][] = [[-0.3, 0.3, 0.5], [-0.1, 0.18, 0.62], [0.1, 0.18, 0.6], [0.3, 0.3, 0.48]];
  for (const [fx, top, len] of fingers) {
    g.roundRect(r + fx * r - r * 0.085, top * r + r * 0.12, r * 0.17, len * r, r * 0.085).fill(hand).stroke(edge);
  }
  g.roundRect(r * 1.38, r * 0.98, r * 0.42, r * 0.17, r * 0.085).fill(hand).stroke(edge);
  return bake(renderer, g, r * 2);
}

function cymbalTexture(renderer: Renderer): Texture {
  const r = 64;
  const g = new Graphics()
    .circle(r, r, r * 0.92).fill(0xe0b040).stroke({ color: 0x3a2410, width: r * 0.12 })
    .circle(r, r, r * 0.55).stroke({ color: 0xffe9a0, width: r * 0.1 })
    .circle(r, r, r * 0.2).fill(0x8a5a18)
    .moveTo(r * 0.45, r * 0.4).lineTo(r * 0.75, r * 0.55).stroke({ color: 0xffffff, width: r * 0.1, alpha: 0.8 });
  return bake(renderer, g, r * 2);
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
  private readonly healTex: Texture;
  private readonly printTex: Texture;
  private readonly cymbalTex: Texture;
  private readonly cymbals = new Map<number, FieldSprite>();
  private readonly bell = bellDome();
  private bellT = BELL_POP;
  /** Golden Body: seconds the hero stays untouchable after the bell broke. */
  private guardT = 0;
  private readonly palms: PalmFalls;

  constructor(
    renderer: Renderer,
    private readonly layer: Container,
    private readonly pool: FxPool,
    private readonly ring: RingMode,
    /** The falling palm's art, drawn at this zIndex (over the horde). */
    palm: { tex: Texture; z: number },
    private readonly rand: () => number = Math.random,
  ) {
    this.palms = new PalmFalls(layer, palm.tex, palm.z);
    this.fieldTex = fieldTexture(renderer, 0xffd860, 0xffe9a0);
    this.healTex = fieldTexture(renderer, 0x7ee0a0, 0xc8ffd8);
    this.printTex = printTexture(renderer);
    this.cymbalTex = cymbalTexture(renderer);
    this.bell.visible = false;
    layer.addChild(this.bell);
  }

  /** The local hero's bell came up: it pops into place. */
  bellUp(): void {
    this.bellT = 0;
  }

  /** The local hero's evolved bell broke: it guards them for `seconds`. */
  guard(seconds: number): void {
    this.guardT = seconds;
  }

  /**
   * The bell over the hero at (x, y) while it is up, or flickering while the Golden Body
   * guards them; zIndex just above the hero.
   */
  drawBell(up: boolean, x: number, y: number, z: number, dt: number): void {
    this.guardT = up ? 0 : Math.max(0, this.guardT - dt);
    const guarding = this.guardT > 0;
    this.bell.visible = up || guarding;
    if (!this.bell.visible) return;
    this.bellT = Math.min(BELL_POP, this.bellT + dt);
    const pop = up ? this.bellT / BELL_POP : 1;
    const breathe = 1 + 0.03 * Math.sin(performance.now() / 220);
    this.bell.scale.set((0.6 + 0.4 * pop) * breathe * (guarding ? 1.1 : 1));
    // the guard fades over its last half second, and flickers gently (no hard strobe)
    this.bell.alpha = guarding ? Math.min(1, this.guardT * 2) * (0.45 + 0.2 * Math.sin(performance.now() / 70)) : pop;
    this.bell.position.set(x, y - 60);
    this.bell.zIndex = z + 0.5;
  }

  /** The sim's flying cymbals: spinning discs, interpolated between ticks. */
  private drawCymbals(cymbals: readonly Cymbal[], alpha: number, dt: number): void {
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
      // a thrown cymbal fades out over its last few ticks; the wheel's never do
      v.sprite.alpha = c.orbit > 0 ? 1 : Math.min(1, (c.life - c.age) / 4);
    }
    for (const [id, v] of this.cymbals) {
      if (v.seen) continue;
      v.sprite.destroy();
      this.cymbals.delete(id);
    }
  }

  /** A cast, or a palm on its way down (positions in FP). */
  cast(e: Extract<SimEvent, { type: 'cast' | 'palm' }>): void {
    const x = e.x / FP;
    const y = e.y / FP;
    const r = e.radius / FP;
    if (e.type === 'palm') this.palms.drop(x, y, r, e.fall / TICK_RATE);
    else if (e.kind === 'nova') nova(this.pool, x, y, 60, r, NOVA_LIFE, 0xfff0b8, this.ring);
    else if (e.kind === 'meteor') explosion(this.pool, this.rand, x, y, r, this.ring);
  }

  /** The sim's fields and cymbals, and the falling palms. */
  draw(fields: readonly Field[], cymbals: readonly Cymbal[], alpha: number, dt: number): void {
    this.drawFields(fields, alpha, dt);
    this.drawCymbals(cymbals, alpha, dt);
    this.palms.update(dt);
  }

  bolt(x0: number, y0: number, x1: number, y1: number): void {
    bolt(this.pool, this.rand, x0, y0, x1, y1);
  }

  /** The sim's lingering fields: a ground disc each, fading in and out, with rising motes. */
  private drawFields(fields: readonly Field[], alpha: number, dt: number): void {
    for (const f of this.sprites.values()) f.seen = false;
    for (const f of fields) {
      const r = f.radius / FP;
      const life = f.life / TICK_RATE;
      let s = this.sprites.get(f.id);
      if (!s) {
        const texture = f.pin ? this.printTex : f.heal > 0 ? this.healTex : this.fieldTex;
        const sprite = new Sprite({ texture, anchor: 0.5 });
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
      if (!f.pin) fieldMotes(this.pool, this.rand, f.x / FP, f.y / FP, r, Math.round(dt * 60));
    }
    for (const [id, s] of this.sprites) {
      if (s.seen) continue;
      s.sprite.destroy();
      this.sprites.delete(id);
    }
  }
}
