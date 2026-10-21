import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { FP, TICK_RATE, type Knife, type SimEvent, type Talisman } from '@hk/engine';
import { bakeTexture } from './bake';
import { CORGI } from './corgiFx';
import { lerpX, lerpY } from './fixedStep';
import type { FxPool } from './fx';
import { explosion, type RingMode } from './spells';
import { SHADOW_Z } from './shadow';
import { ViewPool } from './viewPool';

// The prototype spells' placeholder art (docs: the talismans, the cluster bomb, the Blade
// Circle; engine systems/talismans.ts, bombs.ts, knives.ts): flat shapes baked once, drawn
// from the sim's talisman and knife lists, and bombs flown along an arc from their 'bomb'
// events (the sim only knows where they land). A corgi build draws missiles, a grenade and
// tactical knives.

/** Talismans and knives fly at chest height. */
const LIFT = 50;
/** How high a bomb's arc rises, and a bomblet's. */
const ARC = 320;
const SMALL_ARC = 130;

function bake(renderer: Renderer, g: Graphics, w: number, h: number): Texture {
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, w, h), resolution: 1, antialias: true });
  g.destroy();
  return tex;
}

/** Pointing along +x, so the sprite turns with its heading. */
function talismanTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  if (CORGI) {
    g.poly([10, 18, 30, 6, 30, 30]).fill(0xff9a2a)
      .roundRect(26, 8, 52, 20, 8).fill(0xc8ccd4).stroke({ color: 0x23262e, width: 4 })
      .poly([78, 8, 98, 18, 78, 28]).fill(0xe0403a).stroke({ color: 0x23262e, width: 4 })
      .poly([30, 8, 22, 0, 40, 8]).fill(0x6a7280).poly([30, 28, 22, 36, 40, 28]).fill(0x6a7280);
    return bake(renderer, g, 100, 36);
  }
  g.roundRect(4, 4, 92, 36, 4).fill(0xf6d65a).stroke({ color: 0x3a2410, width: 5 })
    .moveTo(20, 22).lineTo(80, 22).stroke({ color: 0xc8281e, width: 5 })
    .moveTo(34, 12).lineTo(34, 32).moveTo(52, 12).lineTo(58, 32).moveTo(70, 12).lineTo(66, 32).stroke({ color: 0xc8281e, width: 4 });
  return bake(renderer, g, 100, 44);
}

function bombTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  if (CORGI) {
    g.roundRect(14, 22, 52, 58, 18).fill(0x5d6b3a).stroke({ color: 0x1e2414, width: 6 })
      .moveTo(18, 51).lineTo(62, 51).stroke({ color: 0x3c4626, width: 4 })
      .rect(30, 10, 20, 14).fill(0x9aa0a8).stroke({ color: 0x1e2414, width: 4 })
      .moveTo(50, 14).lineTo(66, 24).stroke({ color: 0x9aa0a8, width: 5 });
    return bake(renderer, g, 80, 84);
  }
  g.circle(40, 46, 32).fill(0x2a2a34).stroke({ color: 0x0e0e14, width: 6 })
    .circle(30, 36, 8).fill({ color: 0xffffff, alpha: 0.5 })
    .rect(33, 8, 14, 10).fill(0x6a5a40)
    .moveTo(40, 8).quadraticCurveTo(48, 0, 56, 4).stroke({ color: 0x8a6a3a, width: 4 })
    .circle(57, 4, 5).fill(0xffd040);
  return bake(renderer, g, 80, 84);
}

/** A knife pointing along +x. */
function knifeTexture(renderer: Renderer): Texture {
  const g = new Graphics()
    .roundRect(2, 12, 30, 14, 5).fill(CORGI ? 0x23262e : 0x7a4a22).stroke({ color: 0x1a1410, width: 4 })
    .rect(30, 6, 8, 26).fill(CORGI ? 0x6a7280 : 0xd8a840).stroke({ color: 0x1a1410, width: 3 })
    .poly([38, 10, 94, 16, 104, 19, 94, 24, 38, 28]).fill(0xe6ecf2).stroke({ color: 0x1a1410, width: 4 })
    .moveTo(44, 16).lineTo(90, 19).stroke({ color: 0xffffff, width: 3 });
  return bake(renderer, g, 108, 38);
}

interface Flying {
  sprite: Sprite;
  shadow: Sprite;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  small: boolean;
}

interface Seen {
  sprite: Sprite;
  seen: boolean;
}

export class ArsenalView {
  private readonly talismanTex: Texture;
  private readonly bombTex: Texture;
  private readonly knifeTex: Texture;
  private readonly shadowTex: Texture;
  private readonly sprites: ViewPool<Sprite>;
  private readonly bombs: Flying[] = [];
  private readonly talismans = new Map<number, Seen>();
  private readonly knives = new Map<number, Seen>();

  constructor(
    renderer: Renderer,
    layer: Container,
    private readonly pool: FxPool,
    private readonly ring: RingMode,
    private readonly rand: () => number = Math.random,
  ) {
    this.talismanTex = talismanTexture(renderer);
    this.bombTex = bombTexture(renderer);
    this.knifeTex = knifeTexture(renderer);
    this.shadowTex = bake(renderer, new Graphics().ellipse(32, 12, 30, 10).fill({ color: 0x000000, alpha: 0.35 }), 64, 24);
    this.sprites = new ViewPool(() => new Sprite({ anchor: 0.5 }), (s) => layer.addChild(s));
  }

  /** A bomb or a bomblet thrown: it flies its arc over `flight` ticks. */
  throw(e: Extract<SimEvent, { type: 'bomb' }>): void {
    const sprite = this.sprites.take();
    sprite.texture = this.bombTex;
    sprite.alpha = 1;
    sprite.scale.set(e.small ? 0.55 : 1);
    const shadow = this.sprites.take();
    shadow.texture = this.shadowTex;
    shadow.alpha = 1;
    shadow.rotation = 0;
    shadow.scale.set(e.small ? 0.6 : 1.1);
    shadow.zIndex = SHADOW_Z + 1;
    this.bombs.push({ sprite, shadow, x0: e.x0 / FP, y0: e.y0 / FP, x1: e.x1 / FP, y1: e.y1 / FP, t: 0, dur: e.flight / TICK_RATE, small: e.small });
  }

  /** A bomb went off. */
  boom(e: Extract<SimEvent, { type: 'boom' }>): void {
    explosion(this.pool, this.rand, e.x / FP, e.y / FP, e.radius / FP, this.ring);
  }

  /** The sim's talismans and knives, the hero (whose knives circle him) standing at (hx, hy). */
  draw(talismans: readonly Talisman[], knives: readonly Knife[], alpha: number, dt: number, hx: number, hy: number): void {
    this.flyBombs(dt);
    this.sync(this.talismans, talismans, this.talismanTex, alpha, (q) => (q.dir / 65536) * Math.PI * 2, 0.9);
    // a circling knife points along the circle (brads grow toward +y), a flying one along its flight
    this.sync(this.knives, knives, this.knifeTex, alpha, (k, x, y) => (k.flying ? Math.atan2(k.vy, k.vx) : Math.atan2(y - hy, x - hx) + Math.PI / 2), 1);
  }

  private flyBombs(dt: number): void {
    let w = 0;
    for (const b of this.bombs) {
      b.t = Math.min(b.dur, b.t + dt);
      const u = b.dur > 0 ? b.t / b.dur : 1;
      const x = b.x0 + (b.x1 - b.x0) * u;
      const y = b.y0 + (b.y1 - b.y0) * u;
      const h = (b.small ? SMALL_ARC : ARC) * 4 * u * (1 - u);
      b.sprite.position.set(x, y - h - LIFT * (1 - u));
      b.sprite.rotation += dt * (b.small ? 14 : 8);
      b.sprite.zIndex = y + 2;
      b.shadow.position.set(x, y);
      if (u < 1) {
        this.bombs[w++] = b;
        continue;
      }
      this.sprites.give(b.sprite);
      this.sprites.give(b.shadow);
    }
    this.bombs.length = w;
  }

  private sync<T extends Talisman | Knife>(
    views: Map<number, Seen>, list: readonly T[], tex: Texture, alpha: number, angle: (q: T, x: number, y: number) => number, scale: number,
  ): void {
    for (const v of views.values()) v.seen = false;
    for (const q of list) {
      let v = views.get(q.id);
      if (!v) {
        const sprite = this.sprites.take();
        sprite.texture = tex;
        sprite.alpha = 1;
        sprite.scale.set(scale);
        v = { sprite, seen: false };
        views.set(q.id, v);
      }
      v.seen = true;
      const x = lerpX(q, alpha);
      const y = lerpY(q, alpha);
      v.sprite.position.set(x, y - LIFT);
      v.sprite.rotation = angle(q, x, y);
      v.sprite.zIndex = y + 1;
    }
    for (const [id, v] of views) {
      if (v.seen) continue;
      this.sprites.give(v.sprite);
      views.delete(id);
    }
  }
}
