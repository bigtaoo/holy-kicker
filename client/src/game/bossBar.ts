import { Container, Sprite, Text, Texture } from 'pixi.js';

// A boss's health bar across the top of the play area, under the build strip and the wave
// counter (RunHud): the name over a violet fill. The chapter boss has one; the mid-boss twins
// share one.

const VIOLET = 0xb04cff;
const BAR_W = 760;
const BAR_H = 26;

export class BossBar {
  /** Screen-space, placed by the game in play-area units. */
  readonly view = new Container();
  private readonly fill = new Sprite(Texture.WHITE);

  constructor(name: string) {
    const back = new Sprite(Texture.WHITE);
    back.tint = 0x140c18;
    back.alpha = 0.75;
    back.width = BAR_W + 12;
    back.height = BAR_H + 12;
    back.position.set(-BAR_W / 2 - 6, -6);
    this.fill.tint = VIOLET;
    this.fill.height = BAR_H;
    this.fill.width = BAR_W;
    this.fill.x = -BAR_W / 2;
    const label = new Text({
      text: name,
      style: { fill: 0xffffff, fontFamily: 'Arial', fontWeight: 'bold', fontSize: 48, stroke: { color: 0x140c18, width: 6 } },
    });
    label.anchor.set(0.5, 1);
    label.y = -10;
    this.view.addChild(back, this.fill, label);
  }

  set(hp: number, maxHp: number): void {
    this.fill.width = (BAR_W * Math.max(0, hp)) / Math.max(1, maxHp);
  }

  /** Keeps the bar centred across the top of the play area (play-area pixels and scale). */
  layout(playW: number, scale: number): void {
    this.view.scale.set(scale);
    this.view.position.set(playW / 2, 400 * scale);
  }
}
