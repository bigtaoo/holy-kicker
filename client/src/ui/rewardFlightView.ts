import { Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
import { formatAmount } from '../i18n';
import { TABS } from '../meta/progress';
import { iconSprite, type IconSheet } from './buildBar';
import { TAB_H, tabCells } from './lobbyLayout';
import { bumpAt, flightLength, gainOf, piecesOf, poseAt, shownAt, type Gain, type Piece, type Wallet } from './rewardFlight';
import type { UiFrame } from './uiLayout';
import { COLORS } from './widgets';

// Draws a lobby claim's reward flight (rewardFlight.ts): the pieces over everything, the top bar's
// counters held at the old amounts and ticking up as they land. The lobby rebuilds its views on
// every layout, so this keeps the flight's clock and finds the counters again each time (they
// are named in lobbyBars.ts topBar). A few sprites for under a second: no filters, no full-screen effect.

type Spot = { x: number; y: number };

export class RewardFlight {
  private gain: Gain | null = null;
  private pieces: Piece[] = [];
  private final: Wallet | null = null;
  /** Seconds since the pieces set off; null while a haul popup holds them. */
  private age: number | null = null;
  private from: Spot = { x: 540, y: 960 };
  private layer: Container | null = null;
  private sprites: Container[] = [];
  private targets: Record<'copper' | 'jade' | 'gear', Spot> | null = null;
  private bar: Container | null = null;
  private readonly watched = new WeakSet<Container>();

  constructor(private readonly icons: IconSheet) {}

  /** A change of the save from `before` to `after`: flies what it paid, if anything. */
  paid(before: Wallet, after: Wallet): void {
    const gain = gainOf(before, after);
    if (!gain) return;
    this.gain = gain;
    this.pieces = piecesOf(gain);
    this.final = after;
    this.age = null;
  }

  /**
   * Called at the end of every lobby layout, over everything: the pieces' layer, the counters in
   * `bar` and the Gear tab's cell on frame `f`. `view` is the lobby's own, whose taps say where a flight starts.
   */
  attach(view: Container, bar: Container, f: UiFrame): void {
    if (!this.watched.has(view)) {
      this.watched.add(view);
      view.on('pointerdown', (e: FederatedPointerEvent) => {
        this.from = view.toLocal(e.global);
      });
    }
    this.bar = bar;
    const at = (id: string): Spot => {
      const coin = bar.getChildByLabel(`coin_${id}`);
      return coin ? { x: coin.x + bar.x, y: coin.y + bar.y } : { x: f.w - 200, y: 75 };
    };
    const { x0, tw } = tabCells(f.w, f.h, TABS.length);
    this.targets = { copper: at('copper'), jade: at('jade'), gear: { x: x0 + tw * TABS.indexOf('gear'), y: f.h - TAB_H / 2 } };
    this.layer = view.addChild(new Container());
    this.layer.eventMode = 'none';
    this.sprites = this.pieces.map((p) => {
      const s = p.kind === 'gear' ? this.gearPiece(p.icon) : iconSprite(this.icons, p.icon, 76) ?? new Graphics().circle(0, 0, 24).fill(p.kind === 'jade' ? COLORS.jade : COLORS.copper);
      s.visible = false;
      return this.layer!.addChild(s);
    });
    this.draw();
  }

  /** `held`: a haul popup is up, and the pieces wait for its OK, then fly from the lobby's last tap (the chest opened). */
  update(dt: number, held: boolean): void {
    if (!this.gain) return;
    if (this.age === null) {
      if (held) return;
      this.age = 0;
    } else this.age += dt;
    this.draw();
    if (this.age > flightLength(this.pieces) + 0.2) this.stop();
  }

  private draw(): void {
    if (!this.gain || !this.final || !this.targets || this.layer?.destroyed) return;
    const age = this.age ?? -1;
    for (const kind of ['copper', 'jade'] as const) {
      const text = this.bar?.getChildByLabel(`amount_${kind}`);
      if (text && 'text' in text) text.text = formatAmount(shownAt(kind, this.final[kind], this.gain, this.pieces, age));
      text?.scale.set(bumpAt(kind, this.pieces, age));
    }
    this.pieces.forEach((p, i) => {
      const s = this.sprites[i];
      const pose = poseAt(p, age, this.from, this.targets![p.kind]);
      if (!s || s.destroyed) return;
      s.visible = pose !== null;
      if (!pose) return;
      s.position.set(pose.x, pose.y);
      s.scale.set(pose.scale);
      s.alpha = pose.alpha;
    });
  }

  private stop(): void {
    this.gain = null;
    this.age = null;
    this.pieces = [];
    for (const s of this.sprites) if (!s.destroyed) s.destroy({ children: true });
    this.sprites = [];
    for (const kind of ['copper', 'jade'] as const) {
      this.bar?.getChildByLabel(`amount_${kind}`)?.scale.set(1);
    }
  }

  /** A gear piece: its icon on a small light disc, so it reads against the dark bar. */
  private gearPiece(id: string): Container {
    const c = new Container();
    c.addChild(new Graphics().circle(0, 0, 46).fill(COLORS.text).stroke({ color: COLORS.outline, width: 6 }));
    const icon = iconSprite(this.icons, id, 72);
    if (icon) c.addChild(icon);
    return c;
  }
}
