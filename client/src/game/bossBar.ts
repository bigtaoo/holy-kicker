import { Container, type Text } from 'pixi.js';
import { COLORS, fit, label, meter } from '../ui/widgets';

// A boss's health bar across the top of the play area, under the build strip, the wave
// counter, the last-fall and next-chest lines and the run buttons (RunHud, which end at about 460):
// the name over a violet fill, drawn as the lobby's meter. The chapter boss has one; the mid-boss
// twins share one.

/** A cold violet, the enemies' side of the palette. */
const VIOLET = 0xa064f0;
const BAR_W = 760;
const BAR_H = 28;
/** The bar's top edge in HUD units (ui/uiLayout.ts); its name sits above it, clear of the HUD's rows. */
export const BOSS_BAR_TOP = 550;
export const BOSS_BAR_H = BAR_H;
/** A long name ("Black Carp King, Empowered" in some languages) shrinks to this width. */
const NAME_W = 960;

export class BossBar {
  /** Screen-space, placed by the game in play-area units. */
  readonly view = new Container();
  private readonly gauge = meter(BAR_W, 1, VIOLET, BAR_H);
  private readonly label: Text;

  constructor(name: string) {
    const title = (this.label = label(name, 48, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } }));
    title.anchor.set(0.5, 1);
    title.y = -BAR_H / 2 - 10;
    fit(title, NAME_W);
    this.view.addChild(this.gauge.view, title);
  }

  rename(name: string): void {
    if (this.label.text === name) return;
    this.label.text = name;
    fit(this.label, NAME_W);
  }

  set(hp: number, maxHp: number): void {
    this.gauge.set(Math.max(0, hp) / Math.max(1, maxHp));
  }

  /** Keeps the bar centred across the top of the play area (its width in pixels; the HUD's scale). */
  layout(playW: number, scale: number): void {
    this.view.scale.set(scale);
    this.view.position.set(playW / 2, (BOSS_BAR_TOP + BAR_H / 2) * scale);
  }
}
