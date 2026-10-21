import { Container, type Text } from 'pixi.js';
import { COLORS, label, meter } from '../ui/widgets';

// A boss's health bar across the top of the play area, under the build strip and the wave
// counter (RunHud): the name over a violet fill, drawn as the lobby's meter. The chapter boss has
// one; the mid-boss twins share one.

/** A cold violet, the enemies' side of the palette. */
const VIOLET = 0xa064f0;
const BAR_W = 760;
const BAR_H = 28;

export class BossBar {
  /** Screen-space, placed by the game in play-area units. */
  readonly view = new Container();
  private readonly gauge = meter(BAR_W, 1, VIOLET, BAR_H);
  private readonly label: Text;

  constructor(name: string) {
    const title = (this.label = label(name, 48, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } }));
    title.anchor.set(0.5, 1);
    title.y = -BAR_H / 2 - 10;
    this.view.addChild(this.gauge.view, title);
  }

  rename(name: string): void {
    if (this.label.text !== name) this.label.text = name;
  }

  set(hp: number, maxHp: number): void {
    this.gauge.set(Math.max(0, hp) / Math.max(1, maxHp));
  }

  /** Keeps the bar centred across the top of the play area (play-area pixels and scale). */
  layout(playW: number, scale: number): void {
    this.view.scale.set(scale);
    this.view.position.set(playW / 2, (400 + BAR_H / 2) * scale);
  }
}
