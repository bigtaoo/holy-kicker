import { Container, Sprite, Texture } from 'pixi.js';
import { COLORS } from '../ui/widgets';
import { BAND_RED, bandColor, redPulse } from './healthBand';
import { starRimAlpha } from './starMark';

export { starMarkAt } from './starMark';

// The hero's health bar, under his feet so the eye never leaves him (Archero style): four
// discrete colour bands, green to red as it empties, the red one pulsing gently (healthBand.ts),
// with a pale trail that catches up after a blow. On a run that can still win three stars a thin
// gold rim frames the whole bar; it fades for good once the run's lowest health went under the
// threshold (starMark.ts).

const W = 110;
const H = 14;
const BORDER = 4;
const RIM = 3;
/** Share of the bar the trail closes per second. */
const TRAIL_SPEED = 0.8;

export class HealthBar {
  readonly view = new Container();
  private readonly fill = new Sprite(Texture.WHITE);
  private readonly trail = new Sprite(Texture.WHITE);
  private readonly rim: Sprite | null = null;
  private shown = 1;
  private time = 0;

  /** `markAt`: the three-star threshold, percent of the max health, or null on a run without stars. */
  constructor(private readonly markAt: number | null = null) {
    if (markAt !== null) {
      // a frame around the whole bar, outside its dark border
      this.rim = new Sprite(Texture.WHITE);
      this.rim.tint = COLORS.gold;
      this.rim.width = W + (BORDER + RIM) * 2;
      this.rim.height = H + (BORDER + RIM) * 2;
      this.rim.position.set(-W / 2 - BORDER - RIM, -BORDER - RIM);
      this.view.addChild(this.rim);
    }
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

  /** `lowest`: the run's lowest health so far, percent (the engine's Player.lowest). */
  update(dt: number, hp: number, maxHp: number, lowest = 100): void {
    const k = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.shown = k > this.shown ? k : Math.max(k, this.shown - TRAIL_SPEED * dt);
    this.fill.width = W * k;
    this.trail.width = W * this.shown;
    const band = bandColor(k);
    if (band === BAND_RED) {
      this.time += dt;
      this.fill.tint = redPulse(this.time);
    } else {
      this.time = 0;
      this.fill.tint = band;
    }
    if (this.rim && this.markAt !== null) {
      this.rim.alpha = starRimAlpha(this.rim.alpha, dt, lowest, this.markAt);
      this.rim.visible = this.rim.alpha > 0;
    }
  }
}
