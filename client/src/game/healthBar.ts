import { Container, Sprite, Texture } from 'pixi.js';

// The hero's health bar, under his feet so the eye never leaves him (Archero style): green,
// turning amber then red as it empties, with a pale trail that catches up after a blow.

const W = 110;
const H = 14;
const BORDER = 4;
/** Share of the bar the trail closes per second. */
const TRAIL_SPEED = 0.8;

export class HealthBar {
  readonly view = new Container();
  private readonly fill = new Sprite(Texture.WHITE);
  private readonly trail = new Sprite(Texture.WHITE);
  private shown = 1;

  constructor() {
    const back = new Sprite(Texture.WHITE);
    back.tint = 0x1a1410;
    back.width = W + BORDER * 2;
    back.height = H + BORDER * 2;
    back.position.set(-W / 2 - BORDER, -BORDER);
    for (const s of [this.trail, this.fill]) {
      s.height = H;
      s.width = W;
      s.x = -W / 2;
    }
    this.trail.tint = 0xfff2d8;
    this.view.addChild(back, this.trail, this.fill);
  }

  update(dt: number, hp: number, maxHp: number): void {
    const k = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.shown = k > this.shown ? k : Math.max(k, this.shown - TRAIL_SPEED * dt);
    this.fill.width = W * k;
    this.trail.width = W * this.shown;
    this.fill.tint = k > 0.5 ? 0x5fd35a : k > 0.25 ? 0xf0b030 : 0xe0303a;
  }
}
