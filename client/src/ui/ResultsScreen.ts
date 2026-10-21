import { Container, type Text, type Texture } from 'pixi.js';
import { t } from '../i18n';
import type { Reward } from '../meta/progress';
import type { RunRank } from '../net/backend';
import type { IconSheet } from './buildBar';
import type { DownInfo } from './deathInfo';
import { menuCover } from './lobbyBars';
import { fallPart, headerPart, newsLines, rewardsPart, type Part } from './resultsParts';
import { REVEAL, REVEALED, countUp, partIn } from './resultsReveal';
import type { Screen, UiFrame } from './uiLayout';
import { panelKey } from './panelKeys';
import { COLORS, button, buttonLabel, fit, keyCap, label, panel, playTap } from './widgets';

// Results after a run, in three zones on one card: the header (the title, the waves cleared as
// one big number, a badge for the best and the leaderboard place once the server answers), after
// a lost run a strip with what felled the hero, how near the next goal came and one short tip, and
// the rewards as icons (the copper counting up, the gear in tier-coloured frames), with the rarer
// news (unlocks, chests, the welcome gift) in short lines under them. The parts come in one after
// another (resultsReveal.ts); a tap shows them all. Under the card: Play again (after a lost run,
// the quickest way back into a fight) or Next chapter (after a first clear, so a winner goes on
// instead of stopping at the results), then the rewarded "double copper" offer and Continue side
// by side at the same size, font and colour (CrazyGames' rewarded-ad rules). On a desktop Enter
// takes the first button (Play again or Next chapter, or Continue alone) and Escape continues; the
// buttons wear their keys. The rewarded ad has no key: it plays only on a click.

export interface ResultsActions {
  /** Plays the rewarded ad and pays the bonus; resolves whether it was paid. */
  double(): Promise<boolean>;
  next(): void;
  /** Plays the same chapter again (Next chapter: the one a first clear opened); null where the results lead to the lobby only. */
  again: (() => void) | null;
}

type Offer = 'hidden' | 'offered' | 'playing' | 'paid';

/** Where a card `cardH` tall with `below` of buttons under it starts: the block centred, a touch high, 40 from the top at least. */
export function blockTop(frameH: number, cardH: number, below: number): number {
  return Math.max(40, (frameH - cardH - below) * 0.45);
}

const CARD_W = 920;
const INNER_W = 840;
const GAP = 30;

export class ResultsScreen implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private offer: Offer = 'hidden';
  private rank: RunRank | null = null;
  private age = 0;
  /** The parts in reveal order with where each rests, and the copper count with its part. */
  private parts: [Container, number][] = [];
  private copper: { text: Text; part: number } | null = null;

  constructor(
    private readonly reward: Reward,
    private readonly waves: number,
    private readonly actions: ResultsActions,
    adAvailable: Promise<boolean>,
    rank: Promise<RunRank | null>,
    /** What felled the hero, for a lost run. */
    private readonly fall: DownInfo | null = null,
    private readonly icons: IconSheet = new Map(),
    /** A desktop: the keys work and the buttons show them. */
    private readonly keys = false,
    /** The lobby's baked menu courtyard (menuBackdrop) to sit on; null for the flat background. */
    private readonly backdrop: Texture | null = null,
  ) {
    // the leaderboard badge comes in when the server answers; offline or unranked runs have none
    void rank.then((r) => {
      if (r && !this.view.destroyed) {
        this.rank = r;
        this.relayout();
      }
    });
    // copper 0 has nothing to double
    void adAvailable.then((ok) => {
      if (ok && reward.copper > 0 && this.offer === 'hidden' && !this.view.destroyed) {
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
    // a tap anywhere off the buttons shows everything at once
    const back = menuCover(f, this.backdrop);
    back.on('pointertap', () => this.skip());
    this.view.addChild(back);

    const r = this.reward;
    // the zones top down, each [view, height]; the rewards' copper counts up
    const zones: Part[] = [headerPart(r, this.waves, this.rank, INNER_W)];
    if (this.fall) zones.push(fallPart(this.fall, this.waves, INNER_W, this.icons));
    const total = this.offer === 'paid' ? 2 * r.copper : r.copper;
    const rewards = rewardsPart(r, total, this.icons, INNER_W);
    zones.push(rewards);
    const news = new Container();
    let ny = 0;
    for (const [text, size, fill, style] of newsLines(r, this.offer === 'paid')) {
      const l = fit(label(text, size, fill, style), INNER_W);
      l.y = ny + size / 2;
      news.addChild(l);
      ny += size + 24;
    }
    if (ny > 0) zones.push([news, ny]);

    const cardH = zones.reduce((n, [, h]) => n + h + GAP, 0) + 60;
    const card = new Container();
    // a long card shrinks so the buttons under it stay on screen
    const below = (this.actions.again ? 185 : 0) + 270;
    const k = Math.min(1, (f.h - 80 - below) / cardH);
    card.scale.set(k);
    // the card and its buttons as one block, centred a little above the middle (a short card
    // otherwise floats in the top two thirds over an empty floor)
    card.position.set(f.w / 2, blockTop(f.h, k * cardH, below - 70) + (k * cardH) / 2);
    card.addChild(panel(CARD_W, cardH));
    let y = -cardH / 2 + 40;
    this.parts = [];
    for (const [view, h] of zones) {
      view.y = y;
      card.addChild(view);
      this.parts.push([view, y]);
      y += h + GAP;
    }
    this.view.addChild(card);
    this.copper = { text: rewards.copper, part: zones.indexOf(rewards) };

    const buttons = new Container();
    this.buttons(buttons, f.w / 2, card.y + (k * cardH) / 2 + 130);
    this.view.addChild(buttons);
    this.parts.push([buttons, 0]);
    this.update(0, total);
  }

  /** Play again, then the ad offer and Continue side by side (or Continue alone), from `y` down. */
  private buttons(c: Container, x: number, y: number): void {
    const busy = this.offer === 'playing';
    // with Play again first, Continue (and the ad offer, which matches it) step back
    const second = this.actions.again ? COLORS.panelLocked : COLORS.saffron;
    if (this.actions.again) {
      const again = button(t(this.reward.firstClear ? 'results.nextChapter' : 'results.again'), 640, 150, () => this.actions.again?.(), { fill: COLORS.saffron });
      again.position.set(x, y);
      if (busy) again.eventMode = 'none';
      else if (this.keys) keyCap(again, 640, 150, t('common.keyEnter'));
      c.addChild(again);
      y += 185;
    }
    const pair = this.offer === 'offered' || this.offer === 'playing';
    const w = pair ? 430 : 640;
    const adText = busy ? '…' : t('results.double');
    // the pair share one font size: the size at which the longer label (with the ad's badge) fits
    let size = 52;
    if (pair) {
      const probe = button(adText, w, 140, () => {}, { video: !busy, size });
      const other = button(t('common.continue'), w, 140, () => {}, { size });
      size *= Math.min(buttonLabel(probe).scale.x, buttonLabel(other).scale.x);
      probe.destroy({ children: true });
      other.destroy({ children: true });
    }
    const next = button(t('common.continue'), w, 140, () => this.actions.next(), { fill: second, size });
    next.position.set(pair ? x + w / 2 + 15 : x, y);
    if (busy) next.eventMode = 'none';
    else if (this.keys) keyCap(next, w, 140, t(this.actions.again ? 'common.keyEsc' : 'common.keyEnter'));
    c.addChild(next);
    if (pair) {
      // the same size, font and colour as Continue (CrazyGames' rewarded-ad rules)
      const ad = button(adText, w, 140, () => void this.playAd(), { fill: busy ? COLORS.panelLocked : second, video: !busy, size });
      ad.position.set(x - w / 2 - 15, y);
      if (busy) ad.eventMode = 'none';
      c.addChild(ad);

    }
  }

  update(dt: number, total = this.offer === 'paid' ? 2 * this.reward.copper : this.reward.copper): void {
    this.age += dt;
    for (const [i, [view, rest]] of this.parts.entries()) {
      const k = partIn(this.age, i);
      view.alpha = k;
      view.y = rest + (1 - k) * REVEAL.rise;
    }
    if (this.copper && !this.copper.text.destroyed) this.copper.text.text = `+${countUp(this.age, this.copper.part, total)}`;
  }

  /** Enter: the first key press while the parts come in shows them all, the next plays again (or continues); Escape continues. */
  key(code: string, repeat: boolean): void {
    const k = panelKey(code, repeat);
    if (!this.keys || !k || k === 'pause' || this.offer === 'playing') return;
    if (k === 'ok' && this.age < REVEALED && partIn(this.age, this.parts.length - 1) < 1) return this.skip();
    playTap();
    if (k === 'ok' && this.actions.again) this.actions.again();
    else this.actions.next();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private skip(): void {
    this.age = Math.max(this.age, REVEALED);
  }

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private async playAd(): Promise<void> {
    if (this.offer !== 'offered') return;
    this.offer = 'playing';
    this.relayout();
    const paid = await this.actions.double();
    // a skipped or unfilled ad keeps the offer, so the player can try once more
    this.offer = paid ? 'paid' : 'offered';
    this.relayout();
  }
}
