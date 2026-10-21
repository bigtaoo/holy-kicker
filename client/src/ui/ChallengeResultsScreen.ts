import { Container, Graphics } from 'pixi.js';
import { topPercent, type ChallengeRunReply } from '@hk/protocol';
import { t } from '../i18n';
import { chapterName } from '../i18n/chapterName';
import { BALANCE } from '../meta/balance';
import { milestonePay, type ChallengeReward } from '../meta/challenge';
import type { ChallengeSettled } from './challengeFlow';
import { iconSprite, type IconSheet } from './buildBar';
import { panelKey } from './panelKeys';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, button, buttonLabel, fit, keyCap, label, panel, playTap } from './widgets';

// The results of a daily challenge run (docs/design.md "Challenges"): the waves cleared, the four
// milestones with the ones reached lit, what the counted run paid (a later run of the day is
// practice and pays nothing), the player's share of the board ("top N %") once the server
// answers, and the hours to the next challenge. Under the card the rewarded "double copper" offer
// and Continue side by side at the same size, font and colour, as on the chapter results. A
// weekly run's results have no milestones and pay nothing now: a new best or the best that
// stands, the week's rank once the server answers, and that rewards come when the week ends.

export interface ChallengeResultsActions {
  double(): Promise<boolean>;
  next(): void;
}

type Offer = 'hidden' | 'offered' | 'playing' | 'paid';

const CARD_W = 920;
const INNER_W = 840;
const BADGE_R = 66;

export class ChallengeResultsScreen implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private offer: Offer = 'hidden';
  private reply: ChallengeRunReply | null = null;
  private left = false;
  private readonly reward: ChallengeReward;
  private readonly chapter: number;
  private readonly waves: number;
  /** Hours until the next challenge opens. */
  private readonly hours: number;
  /** A weekly run: the week's best waves before it. */
  private readonly weekly: { before: number } | undefined;

  constructor(
    run: ChallengeSettled,
    private readonly actions: ChallengeResultsActions,
    adAvailable: Promise<boolean>,
    private readonly icons: IconSheet = new Map(),
    private readonly keys = false,
  ) {
    ({ reward: this.reward, chapter: this.chapter, waves: this.waves, hours: this.hours, weekly: this.weekly } = run);
    const reward = this.reward;
    void run.reply.then((r) => {
      if (r && !this.view.destroyed) {
        this.reply = r;
        this.relayout();
      }
    });
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
    this.view.addChild(new Graphics().rect(0, -f.h, f.w, 3 * f.h).fill({ color: COLORS.bg, alpha: 0.92 }));

    const card = new Container();
    const body = this.body();
    const cardH = body.height + 100;
    const k = Math.min(1, (f.h - 80 - 270) / cardH);
    card.scale.set(k);
    card.position.set(f.w / 2, Math.max((k * cardH) / 2 + 40, f.h / 2 - 220));
    card.addChild(panel(CARD_W, cardH));
    body.y = -cardH / 2 + 50;
    card.addChild(body);
    this.view.addChild(card);
    this.buttons(f.w / 2, card.y + (k * cardH) / 2 + 130);
  }

  /** The card's contents, centred on x 0 with their top at y 0. */
  private body(): Container {
    const c = new Container();
    const r = this.reward;
    const add = (text: string, size: number, fill: number, y: number) => {
      const l = fit(label(text, size, fill), INNER_W);
      l.y = y;
      c.addChild(l);
    };
    add(t(this.weekly ? 'weekly.title' : 'challenge.title'), 68, COLORS.saffron, 20);
    add(t('lobby.chapterTitle', { n: this.chapter, name: chapterName(this.chapter) }), 44, COLORS.dim, 95);
    const big = label(String(this.waves), 170, COLORS.text, { stroke: { color: COLORS.outline, width: 12 } });
    big.y = 230;
    c.addChild(big);
    add(t('results.waves'), 40, COLORS.dim, 335);
    if (this.weekly) return this.weeklyBody(c, add, this.weekly.before);
    c.addChild(this.milestones(470));
    let y = 610;
    if (r.counted) {
      c.addChild(this.paid(y));
      if (this.offer === 'paid') {
        y += 80;
        add(t('results.doubled'), 44, COLORS.saffron, y);
      }
    } else add(t('challenge.practiceNote'), 44, COLORS.dim, y);
    y += 100;
    const rep = this.reply;
    if (rep) {
      add(t('challenge.top', { n: topPercent(rep.rank, rep.total) }), 56, COLORS.saffron, y);
      y += 70;
      if (rep.status === 'pending') {
        add(t('challenge.checking'), 38, COLORS.dim, y);
        y += 60;
      }
    }
    add(t('challenge.next', { h: this.hours }), 44, COLORS.text, y);
    return c;
  }

  /** A weekly run's lines under its waves: a new best or the best that stands, the week's rank, when rewards come. */
  private weeklyBody(c: Container, add: (text: string, size: number, fill: number, y: number) => void, before: number): Container {
    const rep = this.reply;
    let y = 450;
    if (this.waves > before && rep?.status !== 'lower') add(t('weekly.newBest'), 60, COLORS.saffron, y);
    else if (before > 0) add(t('weekly.bestStands', { wave: Math.max(before, this.waves) }), 50, COLORS.text, y);
    y += 100;
    if (rep && rep.rank > 0) {
      add(t('weekly.rank', { rank: rep.rank, total: rep.total }), 56, COLORS.saffron, y);
      add(t('challenge.top', { n: topPercent(rep.rank, rep.total) }), 44, COLORS.dim, y + 70);
      y += 140;
      if (rep.status === 'pending') {
        add(t('challenge.checking'), 38, COLORS.dim, y);
        y += 60;
      }
    }
    add(t('weekly.after'), 44, COLORS.text, y);
    return c;
  }

  /** The four milestones as round badges, the reached ones lit, each with its copper under it. */
  private milestones(y: number): Container {
    const row = new Container();
    row.y = y;
    const list = BALANCE.challenge.milestones;
    list.forEach((m, i) => {
      const lit = this.waves >= m.wave;
      const b = new Container();
      b.x = (i - (list.length - 1) / 2) * 200;
      b.addChild(new Graphics().circle(0, 0, BADGE_R).fill(lit ? COLORS.saffron : COLORS.panelLocked).stroke({ color: COLORS.outline, width: 6 }));
      const n = label(String(m.wave), 60, lit ? COLORS.outline : COLORS.dim);
      const pay = label(`+${milestonePay(m, this.chapter).copper}`, 34, lit ? COLORS.copper : COLORS.dim);
      pay.y = BADGE_R + 30;
      b.addChild(n, pay);
      row.addChild(b);
    });
    return row;
  }

  /** The copper (doubled once the ad paid) and jade the counted run paid, as icon chips. */
  private paid(y: number): Container {
    const r = this.reward;
    const row = new Container();
    row.y = y;
    const chip = (icon: string, text: string, fill: number) => {
      const c = new Container();
      const s = iconSprite(this.icons, icon, 80);
      const l = label(text, 60, fill, { stroke: { color: COLORS.outline, width: 8 } });
      l.anchor.set(0, 0.5);
      l.x = 50;
      if (s) c.addChild(s);
      c.addChild(l);
      return c;
    };
    const chips = [chip('copper', `+${this.offer === 'paid' ? 2 * r.copper : r.copper}`, COLORS.copper)];
    if (r.jade > 0) chips.push(chip('jade', `+${r.jade}`, COLORS.jade));
    let x = 0;
    for (const ch of chips) {
      ch.x = x + 40;
      x += ch.width + 60;
      row.addChild(ch);
    }
    row.pivot.x = (x - 60) / 2;
    return row;
  }

  /** The ad offer and Continue side by side, or Continue alone. */
  private buttons(x: number, y: number): void {
    const busy = this.offer === 'playing';
    const pair = this.offer === 'offered' || busy;
    const w = pair ? 430 : 640;
    const adText = busy ? '…' : t('results.double');
    let size = 52;
    if (pair) {
      const probe = button(adText, w, 140, () => {}, { video: !busy, size });
      const other = button(t('common.continue'), w, 140, () => {}, { size });
      size *= Math.min(buttonLabel(probe).scale.x, buttonLabel(other).scale.x);
      probe.destroy({ children: true });
      other.destroy({ children: true });
    }
    const next = button(t('common.continue'), w, 140, () => this.leave(), { size });
    next.position.set(pair ? x + w / 2 + 15 : x, y);
    if (busy) next.eventMode = 'none';
    else if (this.keys) keyCap(next, w, 140, t('common.keyEnter'));
    this.view.addChild(next);
    if (pair) {
      // the same size, font and colour as Continue (CrazyGames' rewarded-ad rules)
      const ad = button(adText, w, 140, () => void this.playAd(), { fill: busy ? COLORS.panelLocked : COLORS.saffron, video: !busy, size });
      ad.position.set(x - w / 2 - 15, y);
      if (busy) ad.eventMode = 'none';
      this.view.addChild(ad);
    }
  }

  /** Enter or Escape continues. */
  key(code: string, repeat: boolean): void {
    const k = panelKey(code, repeat);
    if (!this.keys || !k || k === 'pause' || this.offer === 'playing') return;
    playTap();
    this.leave();
  }

  /** Continue, once (a second tap while the interstitial loads does nothing). */
  private leave(): void {
    if (this.left) return;
    this.left = true;
    this.actions.next();
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
