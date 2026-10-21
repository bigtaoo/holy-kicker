import { Container, Sprite, Texture } from 'pixi.js';
import { starMarkAlpha } from './starMark';

export { starMarkAt } from './starMark';

// The hero's health bar, under his feet so the eye never leaves him (Archero style): green,
// turning amber then red as it empties, with a pale trail that catches up after a blow. On a run
// that can still win three stars a gold tick marks the health it must never drop under
// (starMark.ts); it fades once the run's lowest health went below it.

const W = 110;
const H = 14;
const BORDER = 4;
/** Share of the bar the trail closes per second. */
const TRAIL_SPEED = 0.8;
const MARK_W = 4;
const MARK_OVER = 5;
const MARK_GOLD = 0xffd040;

export class HealthBar {
  readonly view = new Container();
  private readonly fill = new Sprite(Texture.WHITE);
  private readonly trail = new Sprite(Texture.WHITE);
  private readonly mark: Container | null = null;
  private shown = 1;

  /** `markAt`: the three-star threshold, percent of the max health, or null on a run without stars. */
  constructor(private readonly markAt: number | null = null) {
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
    if (markAt !== null) {
      // a gold tick in a dark rim, standing out of the bar above and below
      const x = -W / 2 + (W * markAt) / 100;
      const rim = new Sprite(Texture.WHITE);
      rim.tint = 0x1a1410;
      rim.width = MARK_W + 4;
      rim.height = H + 2 * MARK_OVER + 4;
      rim.position.set(x - MARK_W / 2 - 2, -MARK_OVER - 2);
      const gold = new Sprite(Texture.WHITE);
      gold.tint = MARK_GOLD;
      gold.width = MARK_W;
      gold.height = H + 2 * MARK_OVER;
      gold.position.set(x - MARK_W / 2, -MARK_OVER);
      this.mark = new Container();
      this.mark.addChild(rim, gold);
      this.view.addChild(this.mark);
    }
  }

  /** `lowest`: the run's lowest health so far, percent (the engine's Player.lowest). */
  update(dt: number, hp: number, maxHp: number, lowest = 100): void {
    const k = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.shown = k > this.shown ? k : Math.max(k, this.shown - TRAIL_SPEED * dt);
    this.fill.width = W * k;
    this.trail.width = W * this.shown;
    this.fill.tint = k > 0.5 ? 0x5fd35a : k > 0.25 ? 0xf0b030 : 0xe0303a;
    if (this.mark && this.markAt !== null) {
      this.mark.alpha = starMarkAlpha(this.mark.alpha, dt, lowest, this.markAt);
      this.mark.visible = this.mark.alpha > 0;
    }
  }
}
