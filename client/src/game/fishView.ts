import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { FISH, FP, TICK_RATE } from '@hk/engine';
import { FISH_SHOW, fishPop, rippleAt } from './ripple';

// The wooden fish relic (engine systems/fish.ts): on a tap the fish pops up by the hero's hand
// and a gold ring grows from where he stood to the ring's reach, then fades. The Stunning
// Bell's stunning ring is a white double band. Rings stay where they were tapped, like the sim's.

const GOLD = 0xffd860;
const STUN = 0xffffff;
const OUTLINE = 0x3a2410;
/** World units per second, the sim's ring speed. */
const SPEED = (FISH.ringSpeed * TICK_RATE) / FP;
/** The fish's height, and where it shows beside the hero's hands. */
const FISH_H = 70;
const FISH_X = 58;
const FISH_Y = 70;

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

  constructor(private readonly world: Container, tex: Texture, private readonly ringZ: number) {
    this.fish = new Sprite(tex);
    this.fish.anchor.set(0.5, 0.8);
    this.fish.visible = false;
    world.addChild(this.fish);
  }

  /** A tap at (x, y) in world units; `reach` too. */
  tap(x: number, y: number, reach: number, stun: boolean, facing: number): void {
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
  }

  private band(g: Graphics, x: number, y: number, radius: number, width: number, color: number, alpha: number): void {
    g.circle(x, y, radius).stroke({ color: OUTLINE, width: width + 10, alpha: 0.35 * alpha })
      .circle(x, y, radius).stroke({ color, width, alpha: 0.85 * alpha });
  }

  update(dt: number, hx: number, hy: number, heroZ: number): void {
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
    this.fish.scale.set((FISH_H / this.fish.texture.height) * k);
    // the art's mouth faces left: mirror it to face the way the hero does
    this.fish.scale.x *= -this.facing;
    this.fish.position.set(hx + this.facing * FISH_X, hy - FISH_Y);
    this.fish.zIndex = heroZ + 0.5;
  }
}
