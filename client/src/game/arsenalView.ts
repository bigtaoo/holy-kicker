import { Container, Graphics, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { FP, TICK_RATE, type Knife, type SimEvent, type Talisman } from '@hk/engine';
import { bakeTexture } from './bake';
import { CORGI } from './corgiFx';
import { lerpX, lerpY } from './fixedStep';
import type { FxPool } from './fx';
import { explosion, type RingMode } from './spells';
import { SHADOW_Z } from './shadow';
import { ViewPool } from './viewPool';

// The talismans, the cluster bomb and the Blade Circle (engine systems/talismans.ts, bombs.ts,
// knives.ts), drawn with their build icons (art/monk/icons; the corgi's homing missiles, grenade
// and combat knives): talismans and knives from the sim's lists, bombs flown along an arc from
// their 'bomb' events (the sim only knows where they land).

/** Talismans and knives fly at chest height. */
const LIFT = 50;
/** How high a bomb's arc rises, and a bomblet's. */
const ARC = 320;
const SMALL_ARC = 130;
/**
 * How far each icon is turned from pointing along +x (the talisman and missile stand nose up; the
 * monk's knife points up and right, the corgi's straight up), and its size in the world.
 */
const TALISMAN_TURN = Math.PI / 2;
const KNIFE_TURN = CORGI ? Math.PI / 2 : Math.PI / 4;
const TALISMAN_SCALE = 0.7;
const KNIFE_SCALE = CORGI ? 0.85 : 0.65;
const BOMB_SCALE = 0.65;

function bake(renderer: Renderer, g: Graphics, w: number, h: number): Texture {
  const tex = bakeTexture(renderer, { target: g, frame: new Rectangle(0, 0, w, h), resolution: 1, antialias: true });
  g.destroy();
  return tex;
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
    icons: ReadonlyMap<string, Texture>,
    private readonly rand: () => number = Math.random,
  ) {
    this.talismanTex = icons.get('talisman') ?? Texture.EMPTY;
    this.bombTex = icons.get('bomb') ?? Texture.EMPTY;
    this.knifeTex = icons.get('knives') ?? Texture.EMPTY;
    this.shadowTex = bake(renderer, new Graphics().ellipse(32, 12, 30, 10).fill({ color: 0x000000, alpha: 0.35 }), 64, 24);
    this.sprites = new ViewPool(() => new Sprite({ anchor: 0.5 }), (s) => layer.addChild(s));
  }

  /** A bomb or a bomblet thrown: it flies its arc over `flight` ticks. */
  throw(e: Extract<SimEvent, { type: 'bomb' }>): void {
    const sprite = this.sprites.take();
    sprite.texture = this.bombTex;
    sprite.alpha = 1;
    sprite.scale.set(BOMB_SCALE * (e.small ? 0.55 : 1));
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
    this.sync(this.talismans, talismans, this.talismanTex, alpha, (q) => (q.dir / 65536) * Math.PI * 2 + TALISMAN_TURN, TALISMAN_SCALE);
    // a circling knife points along the circle (brads grow toward +y), a flying one along its flight
    this.sync(this.knives, knives, this.knifeTex, alpha, (k, x, y) => (k.flying ? Math.atan2(k.vy, k.vx) : Math.atan2(y - hy, x - hx) + Math.PI / 2) + KNIFE_TURN, KNIFE_SCALE);
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
