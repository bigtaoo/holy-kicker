import { Container, Sprite, type Texture } from 'pixi.js';
import { launch, stepBall, type Ball, type BallParams } from './cuju';
import type { Mob } from './horde';
import { makeShadow } from './shadow';

// Kicked cuju balls in flight: a spinning sprite over a ground shadow. Spent balls are hidden
// and kept for the next kick instead of being destroyed.

const SIZE = 48;
/** Drawn this far above its ground point. */
export const BALL_LIFT = 45;

interface Flight {
  ball: Ball;
  sprite: Sprite;
  shadow: Sprite;
}

export class Balls {
  private readonly live: Flight[] = [];
  private readonly free: Flight[] = [];

  constructor(
    private readonly layer: Container,
    private readonly tex: Texture,
    private readonly shadowTex: Texture,
    private readonly params: BallParams,
  ) {}

  get count(): number {
    return this.live.length;
  }

  spawn(x: number, y: number, tx: number, ty: number): void {
    let f = this.free.pop();
    if (!f) {
      const sprite = new Sprite(this.tex);
      sprite.anchor.set(0.5);
      sprite.scale.set(SIZE / this.tex.height);
      f = { ball: {} as Ball, sprite, shadow: makeShadow(this.shadowTex, SIZE * 0.4, SIZE * 0.15) };
      this.layer.addChild(f.shadow, f.sprite);
    }
    f.sprite.visible = f.shadow.visible = true;
    launch(x, y, tx, ty, this.params, f.ball);
    this.place(f, 0);
    this.live.push(f);
  }

  /** Flies every ball; `onHit` gets the index of each target hit and the ball's position. */
  update(dt: number, targets: readonly Mob[], onHit: (target: number, x: number, y: number) => void): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      const hit = stepBall(f.ball, targets, dt, this.params);
      if (hit >= 0) onHit(hit, f.ball.x, f.ball.y);
      if (!f.ball.alive) {
        f.sprite.visible = f.shadow.visible = false;
        this.free.push(f);
        live[i] = live[live.length - 1];
        live.pop();
        continue;
      }
      this.place(f, dt);
    }
  }

  private place(f: Flight, dt: number): void {
    const { ball, sprite, shadow } = f;
    sprite.position.set(ball.x, ball.y - BALL_LIFT);
    sprite.rotation += dt * 14 * Math.sign(ball.vx || 1);
    sprite.zIndex = ball.y + 1;
    shadow.position.set(ball.x, ball.y);
  }
}
