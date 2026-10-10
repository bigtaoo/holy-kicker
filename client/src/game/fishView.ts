import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { FISH, FP, TICK_RATE } from '@hk/engine';
import { FISH_SHOW, fishPop, rippleAt } from './ripple';

// The wooden fish relic (engine systems/fish.ts): on a tap the fish pops up under the hand
// that knocks it (hero.ts "knock") and a gold ring grows from where he stood to the ring's
// reach, then fades. Awakened, the fish becomes the Morning Bell: a bronze bell hanging from
// the hand that swings when struck, its stunning ring a white double band. Rings stay where
// they were tapped, like the sim's.

const GOLD = 0xffd860;
const STUN = 0xffffff;
const OUTLINE = 0x3a2410;
/** World units per second, the sim's ring speed. */
const SPEED = (FISH.ringSpeed * TICK_RATE) / FP;
/** The fish's height, and how far under the knocking hand its top shows. */
const FISH_H = 56;
const FISH_DROP = 4;
/** The Morning Bell hangs from the hand by its loop, this tall, and swings this far (radians). */
const BELL_H = 66;
const BELL_SWAY = 0.35;

interface Ripple {
  g: Graphics;
  x: number;
  y: number;
  reach: number;
  stun: boolean;
  t: number;
}

export class FishTaps {
  private readonly fish: Sprite;
  private readonly ripples: Ripple[] = [];
  private fishT = FISH_SHOW;
  private facing = 1;
  private hand = { x: 0, y: 0 };
  private bell = false;

  /** The rings go in the world; the fish goes in `held`, the hero's layer for what he holds. */
  constructor(
    private readonly world: Container,
    held: Container,
    private readonly tex: Texture,
    private readonly bellTex: Texture,
    private readonly ringZ: number,
  ) {
    this.fish = new Sprite(tex);
    this.fish.anchor.set(0.5, 0.15);
    this.fish.visible = false;
    held.addChild(this.fish);
  }

  /**
   * A tap at (x, y) in world units; `reach` too; `bell` once awakened. `hand` is the knocking
   * hand, from the hero's feet.
   */
  tap(x: number, y: number, reach: number, stun: boolean, bell: boolean, facing: number, hand: { x: number; y: number }): void {
    // a free ring (gone ones are kept for reuse)
    let r = this.ripples.find((q) => !q.g.visible);
    if (!r) {
      r = { g: new Graphics(), x: 0, y: 0, reach: 0, stun: false, t: 0 };
      this.world.addChild(r.g);
      this.ripples.push(r);
    }
    Object.assign(r, { x, y, reach, stun, t: 0 });
    r.g.visible = true;
    this.fishT = 0;
    this.facing = facing < 0 ? -1 : 1;
    this.hand = hand;
    if (bell !== this.bell) {
      this.bell = bell;
      this.fish.texture = bell ? this.bellTex : this.tex;
      this.fish.anchor.set(0.5, bell ? 0.06 : 0.15);
    }
  }

  private band(g: Graphics, x: number, y: number, radius: number, width: number, color: number, alpha: number): void {
    g.circle(x, y, radius).stroke({ color: OUTLINE, width: width + 10, alpha: 0.35 * alpha })
      .circle(x, y, radius).stroke({ color, width, alpha: 0.85 * alpha });
  }

  update(dt: number): void {
    for (const r of this.ripples) {
      if (!r.g.visible) continue;
      r.t += dt;
      const look = rippleAt(r.t, r.reach, SPEED);
      if (!look) {
        r.g.visible = false;
        continue;
      }
      r.g.zIndex = this.ringZ;
      r.g.clear();
      this.band(r.g, r.x, r.y, look.radius, r.stun ? 26 : 18, r.stun ? STUN : GOLD, look.alpha);
      // the stunning ring is a double band, so it reads apart from the ordinary ones
      if (r.stun && look.radius > 60) this.band(r.g, r.x, r.y, look.radius - 50, 14, STUN, look.alpha);
    }
    this.fishT += dt;
    const k = fishPop(this.fishT);
    this.fish.visible = k > 0;
    if (k <= 0) return;
    if (this.bell) {
      // hangs from the hand, rung away from the hero and swinging back
      this.fish.scale.set((BELL_H / this.fish.texture.height) * k);
      this.fish.rotation = -this.facing * BELL_SWAY * Math.sin(this.fishT * 22) * (1 - this.fishT / FISH_SHOW);
      this.fish.position.set(this.hand.x, this.hand.y);
      return;
    }
    this.fish.scale.set((FISH_H / this.fish.texture.height) * k);
    // the art's mouth faces left: mirror it to face the way the hero does
    this.fish.scale.x *= -this.facing;
    this.fish.rotation = 0;
    this.fish.position.set(this.hand.x, this.hand.y + FISH_DROP);
  }
}
