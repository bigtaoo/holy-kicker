import { Container, type Texture } from 'pixi.js';
import { t } from '../i18n';
import type { ArenaReward } from '../meta/arena';
import { iconSprite, type IconSheet } from './buildBar';
import { clockTenths } from './clearTime';
import { menuCover } from './lobbyBars';
import { blockTop } from './ResultsScreen';
import { MISS, pill, rankPill, type RankNote } from './resultsParts';
import { panelKey } from './panelKeys';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, button, buttonLabel, fit, keyCap, label, panel, playTap } from './widgets';
import { spot } from './spots';

// The results of an arena run (docs/design.md "Arena"): the wave reached and the time survived, a
// new best or the best that stands, the board's place once the server answers, and the copper the
// minutes paid. Under the card the rewarded "double copper" offer beside Continue (the same size,
// font and colour, as on the chapter results), and Play again, which keeps the player in the arena.

export interface ArenaResultsActions {
  double(): Promise<boolean>;
  /** Back to the lobby. */
  next(): void;
  again(): void;
}

/** What the run reached and what it paid. */
export interface ArenaRun {
  wave: number;
  tenths: number;
  reward: ArenaReward;
}

type Offer = 'hidden' | 'offered' | 'playing' | 'paid';

const CARD_W = 920;
const INNER_W = 840;
const BTN_W = 450;
const BTN_H = 140;

export class ArenaResultsScreen implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private offer: Offer = 'hidden';
  private rank: RankNote = null;
  private left = false;

  constructor(
    private readonly run: ArenaRun,
    private readonly actions: ArenaResultsActions,
    adAvailable: Promise<boolean>,
    rank: Promise<RankNote>,
    private readonly icons: IconSheet = new Map(),
    private readonly keys = false,
    /** The lobby's baked menu courtyard (menuBackdrop) to sit on; null for the flat background. */
    private readonly backdrop: Texture | null = null,
  ) {
    void rank.then((r) => {
      if (r && !this.view.destroyed) {
        this.rank = r;
        this.relayout();
      }
    });
    void adAvailable.then((ok) => {
      if (ok && run.reward.copper > 0 && this.offer === 'hidden' && !this.view.destroyed) {
        this.offer = 'offered';
        this.relayout();
      }
    });
  }

  layout(f: UiFrame): void {
    this.frame = f;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.view.addChild(menuCover(f, this.backdrop));
    const card = new Container();
    const body = this.body();
    const cardH = body.height + 100;
    // two rows of buttons under the card
    const k = Math.min(1, (f.h - 80 - 430) / cardH);
    card.scale.set(k);
    card.position.set(f.w / 2, blockTop(f.h, k * cardH, 360) + (k * cardH) / 2);
    card.addChild(panel(CARD_W, cardH));
    body.y = -cardH / 2 + 50;
    card.addChild(body);
    this.view.addChild(card);
    this.buttons(f.w / 2, card.y + (k * cardH) / 2 + 130);
  }

  /** The card's contents, centred on x 0 with their top at y 0. */
  private body(): Container {
    const c = new Container();
    const { wave, tenths, reward } = this.run;
    const add = (text: string, size: number, fill: number, y: number) => {
      const l = fit(label(text, size, fill, { wordWrap: true, wordWrapWidth: INNER_W, breakWords: true }), INNER_W);
      l.y = y;
      c.addChild(l);
    };
    add(t('arena.title'), 68, COLORS.saffron, 20);
    const big = label(String(wave), 170, reward.newBest ? COLORS.gold : COLORS.text, { stroke: { color: COLORS.outline, width: 12 } });
    big.y = 160;
    c.addChild(big);
    add(t('results.waves'), 48, COLORS.dim, 270);
    add(t('arena.survived', { time: clockTenths(tenths) }), 56, COLORS.text, 350);
    let y = 440;
    // the best (or a new one) and the board's place, side by side
    const badges: Container[] = [];
    if (reward.newBest) badges.push(pill(t('results.newBest'), COLORS.gold));
    else if (reward.before.waves > 0) badges.push(pill(t('arena.best', { wave: reward.before.waves, time: clockTenths(reward.before.tenths) }), COLORS.dim));
    const rank = this.rank;
    if (rank && typeof rank === 'object') badges.push(rankPill(rank));
    if (badges.length > 0) {
      const row = new Container();
      let x = 0;
      for (const b of badges) {
        b.x = x + b.width / 2;
        x += b.width + 24;
        row.addChild(b);
      }
      row.pivot.x = (x - 24) / 2;
      if (row.width > INNER_W) row.scale.set(INNER_W / row.width);
      row.y = y;
      c.addChild(row);
      y += 90;
    }
    if (typeof rank === 'string') {
      // two lines, wrapped about their centre
      add(t(MISS[rank]), 48, COLORS.dim, y + 30);
      y += 130;
    }
    c.addChild(this.paid(y + 20));
    if (this.offer === 'paid') add(t('results.doubled'), 48, COLORS.copper, y + 104);
    return c;
  }

  /** The copper the minutes paid (doubled once the ad paid), as an icon chip. */
  private paid(y: number): Container {
    const copper = this.run.reward.copper;
    const row = new Container();
    row.y = y;
    const s = iconSprite(this.icons, 'copper', 80);
    const l = label(`+${this.offer === 'paid' ? 2 * copper : copper}`, 60, COLORS.copper, { stroke: { color: COLORS.outline, width: 8 } });
    l.anchor.set(0, 0.5);
    l.x = 50;
    if (s) row.addChild(s);
    row.addChild(l);
    row.pivot.x = (50 + l.width) / 2 - 40;
    return row;
  }

  /** Continue beside the ad offer (or Play again), and Play again under them while the offer stands. */
  private buttons(x: number, y: number): void {
    const busy = this.offer === 'playing';
    const offer = this.offer === 'offered' || busy;
    const side = offer ? (busy ? '…' : t('results.double')) : t('results.again');
    const probe = button(side, BTN_W, BTN_H, () => {}, { video: offer && !busy });
    const other = button(t('common.continue'), BTN_W, BTN_H, () => {});
    const size = 52 * Math.min(buttonLabel(probe).scale.x, buttonLabel(other).scale.x);
    probe.destroy({ children: true });
    other.destroy({ children: true });
    const next = button(t('common.continue'), BTN_W, BTN_H, () => this.leave(this.actions.next), { size });
    next.position.set(x + BTN_W / 2 + 10, y);
    if (busy) next.eventMode = 'none';
    else if (this.keys) keyCap(next, BTN_W, BTN_H, t('common.keyEnter'));
    this.view.addChild(spot('next', next));
    const left = offer
      ? button(side, BTN_W, BTN_H, () => void this.playAd(), { fill: busy ? COLORS.panelLocked : COLORS.saffron, video: !busy, size })
      : button(side, BTN_W, BTN_H, () => this.leave(this.actions.again), { fill: COLORS.jade, size });
    left.position.set(x - BTN_W / 2 - 10, y);
    if (busy) left.eventMode = 'none';
    this.view.addChild(offer ? left : spot('again', left));
    if (!offer) return;
    const again = button(t('results.again'), BTN_W, 120, () => this.leave(this.actions.again), { fill: COLORS.jade, size: 48 });
    again.position.set(x, y + 160);
    if (busy) again.eventMode = 'none';
    this.view.addChild(spot('again', again));
  }

  /** Enter or Escape continues. */
  key(code: string, repeat: boolean): void {
    const k = panelKey(code, repeat);
    if (!this.keys || !k || k === 'pause' || this.offer === 'playing') return;
    playTap();
    this.leave(this.actions.next);
  }

  /** Leaves once (a second tap while the interstitial loads does nothing). */
  private leave(go: () => void): void {
    if (this.left) return;
    this.left = true;
    go();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private async playAd(): Promise<void> {
    if (this.offer !== 'offered') return;
    this.offer = 'playing';
    this.relayout();
    const paid = await this.actions.double();
    this.offer = paid ? 'paid' : 'offered';
    this.relayout();
  }
}
