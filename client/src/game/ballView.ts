import { Container, Sprite, type Texture } from 'pixi.js';
import type { Ball } from '@hk/engine';
import { lerpX, lerpY } from './fixedStep';
import { makeShadow } from './shadow';

// Kicked cuju balls in flight, drawn from the sim's ball list: a spinning sprite over a ground
// shadow per ball id. Spent sprites are hidden and kept for the next kick. The awakened
// Meteor Ball glows hot, and its one-hit splinters are smaller.

const SIZE = 48;
const METEOR_TINT = 0xffb070;
const SPLINTER_SCALE = 0.7;
/** Drawn this far above its ground point. */
export const BALL_LIFT = 45;

interface Flight {
  sprite: Sprite;
  shadow: Sprite;
  seen: boolean;
}

export class Balls {
  private readonly live = new Map<number, Flight>();
  private readonly free: Flight[] = [];

  constructor(
    private readonly layer: Container,
    private readonly tex: Texture,
    private readonly shadowTex: Texture,
  ) {}

  sync(balls: readonly Ball[], alpha: number, dt: number): void {
    for (const f of this.live.values()) f.seen = false;
    for (const b of balls) {
      let f = this.live.get(b.id);
      if (!f) {
        f = this.take();
        this.live.set(b.id, f);
      }
      f.seen = true;
      const x = lerpX(b, alpha);
      const y = lerpY(b, alpha);
      f.sprite.position.set(x, y - BALL_LIFT);
      f.sprite.rotation += dt * 14 * Math.sign(b.vx || 1);
      const splinter = !b.split && b.maxHits === 1;
      f.sprite.tint = b.split || splinter ? METEOR_TINT : 0xffffff;
      f.sprite.scale.set(((splinter ? SPLINTER_SCALE : 1) * SIZE) / this.tex.height);
      f.sprite.zIndex = y + 1;
      f.shadow.position.set(x, y);
    }
    for (const [id, f] of this.live) {
      if (f.seen) continue;
      f.sprite.visible = f.shadow.visible = false;
      this.free.push(f);
      this.live.delete(id);
    }
  }

  private take(): Flight {
    let f = this.free.pop();
    if (!f) {
      const sprite = new Sprite(this.tex);
      sprite.anchor.set(0.5);
      sprite.scale.set(SIZE / this.tex.height);
      f = { sprite, shadow: makeShadow(this.shadowTex, SIZE * 0.4, SIZE * 0.15), seen: false };
      this.layer.addChild(f.shadow, f.sprite);
    }
    f.sprite.visible = f.shadow.visible = true;
    return f;
  }
}
