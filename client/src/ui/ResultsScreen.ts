import { Container, Graphics, type Text, type Texture } from 'pixi.js';
import type { ChapterLook } from '../chapterArt';
import { t } from '../i18n';
import type { Reward, Tab } from '../meta/progress';
import type { NextStep } from '../meta/waiting';
import type { IconSheet } from './buildBar';
import type { DownInfo } from './deathInfo';
import { menuCover } from './lobbyBars';
import { nextStepPart, previewPart } from './resultsNext';
import { fallPart, headerPart, newsLines, rewardsPart, type Part, type RankNote } from './resultsParts';
import { newcomerUnlocks, unlocksPart } from './resultsUnlocks';
import { REVEAL, REVEALED, countUp, partIn } from './resultsReveal';
import { fitScale, rowCentres, WIDE_PAD, widePlan } from './resultsLayout';
import type { Screen, UiFrame } from './uiLayout';
import { panelKey } from './panelKeys';
import { COLORS, button, buttonLabel, keyCap, label, panel, playTap } from './widgets';
import { spot } from './spots';

// Results after a run, in three zones on one card: the header (the title, the wave reached as
// one big number, a badge for the best and the leaderboard place once the server answers), after
// a lost run a strip with what felled the hero, how near the next goal came and one short tip,
// then the one step in the lobby that makes the next run go further (training the copper buys,
// else gear to merge) with a quiet button to its tab, and the rewards as icons (the copper counting up,
// the gear in tier-coloured frames, the name of the best or the one pointed at under them), what the run unlocked as strips (resultsUnlocks.ts), the rarer news (chests, the welcome gift) in
// short lines under them, and after a first clear the chapter it opened. The parts come in one
// after another (resultsReveal.ts); a tap shows them all. Under the card two buttons: with
// something waiting in the lobby (the count its red badges add up to, lobbyWaiting), Collect in the lobby
// leads and Play again steps back; with nothing, Play again leads and Back to lobby steps back. A
// first clear always leads with Next chapter, so a winner goes on. Until a chapter is cleared
// (Reward.newcomer) the card keeps to the title, the waves, the stars, the rewards, one unlock and
// the chapter opened, so a player who just met the game is not handed a list. The lower one sits beside the
// rewarded "double copper" offer at the same size, font and colour (CrazyGames' rewarded-ad rules).
// On a desktop Enter takes the first button and Escape goes to the lobby; the buttons wear their
// keys. The rewarded ad has no key: it plays only on a click. A landscape frame has one wide
// panel in the middle instead (resultsLayout.ts): the run on the left, what it brought on the
// right, the buttons in one row along its foot with the leading one at the right end.

export interface ResultsActions {
  /** Plays the rewarded ad and pays the bonus; resolves whether it was paid. */
  double(): Promise<boolean>;
  /** To the lobby; `tab` opens it on that tab. */
  next(tab?: Tab): void;
  /** Plays the same chapter again (Next chapter: the one a first clear opened); null where the results lead to the lobby only. */
  again: (() => void) | null;
  /** How many things wait in the lobby now, asked at each layout (doubled copper may buy training). */
  waiting(): number;
  /** After a lost run, the one step in the lobby to point to. */
  step(): NextStep | null;
  /** After a first clear, the chapter it opened, once its art is in (null when it fails). */
  preview?: Promise<ChapterLook | null>;
}

type Offer = 'hidden' | 'offered' | 'playing' | 'paid';

/** Where a card `cardH` tall with `below` of buttons under it starts: the block centred, a touch high, 40 from the top at least. */
export function blockTop(frameH: number, cardH: number, below: number): number {
  return Math.max(40, (frameH - cardH - below) * 0.45);
}

const CARD_W = 920;
const INNER_W = 840;
const GAP = 30;
/** The buttons' gap in a landscape row. */
const ROW_GAP = 30;

export class ResultsScreen implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private offer: Offer = 'hidden';
  private rank: RankNote = null;
  private age = 0;
  /** The parts in reveal order with where each rests, and the copper count with its part. */
  private parts: [Container, number][] = [];
  private copper: { text: Text; part: number } | null = null;
  private look: ChapterLook | null = null;
  /** What Enter does: the first button's action. */
  private primary: () => void = () => this.actions.next();

  constructor(
    private readonly reward: Reward,
    private readonly waves: number,
    private readonly actions: ResultsActions,
    adAvailable: Promise<boolean>,
    rank: Promise<RankNote>,
    /** What felled the hero, for a lost run. */
    private readonly fall: DownInfo | null = null,
    private readonly icons: IconSheet = new Map(),
    /** A desktop: the keys work and the buttons show them. */
    private readonly keys = false,
    /** The lobby's baked menu courtyard (menuBackdrop) to sit on; null for the flat background. */
    private readonly backdrop: Texture | null = null,
  ) {
    // the leaderboard badge, or why the run has none, comes in when the server answers; offline or unranked runs have none
    void rank.then((r) => {
      if (r && !this.view.destroyed) {
        this.rank = r;
        this.relayout();
      }
    });
    void actions.preview?.then((look) => {
      if (look && !this.view.destroyed) {
        this.look = look;
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
    // the zones top down, each [view, height], in two groups: the run, then what it brought; the rewards' copper counts up
    const run: Part[] = [headerPart(r, this.waves, this.rank, INNER_W)];
    if (this.fall) {
      run.push(fallPart(this.fall, this.waves, INNER_W, this.icons));
      const step = this.actions.step();
      if (step) run.push(nextStepPart(step, INNER_W, () => this.actions.next(step.tab)));
    }
    const total = this.offer === 'paid' ? 2 * r.copper : r.copper;
    const rewards = rewardsPart(r, total, this.icons, INNER_W);
    const haul: Part[] = [rewards];
    const unlocks = unlocksPart(r.newcomer ? newcomerUnlocks(r.unlocks) : r.unlocks, this.icons, INNER_W);
    if (unlocks) haul.push(unlocks);
    const news = new Container();
    let ny = 0;
    // a long line (a long translation) wraps rather than shrinking below the card's text size
    for (const [text, size, fill, style] of newsLines(r, this.offer === 'paid')) {
      const l = label(text, size, fill, { ...style, wordWrap: true, wordWrapWidth: INNER_W, breakWords: true });
      l.anchor.set(0.5, 0);
      l.y = ny;
      news.addChild(l);
      ny += l.height + 20;
    }
    if (ny > 0) haul.push([news, ny]);
    if (this.look && this.actions.again) haul.push(previewPart(this.look, INNER_W));
    const zones = [...run, ...haul];
    this.parts = [];
    this.copper = { text: rewards.copper, part: zones.indexOf(rewards) };
    // a landscape frame (at least 2560 x 1440) has room for one wide panel: the run beside what it brought, the buttons along its foot
    if (f.w > f.h) this.wide(f, run, haul);
    else this.tall(f, zones);
    this.update(0, total);
  }

  /** Portrait: the zones down one card, the buttons under it. */
  private tall(f: UiFrame, zones: Part[]): void {
    const cardH = zones.reduce((n, [, h]) => n + h + GAP, 0) + 60;
    const card = new Container();
    const rows = this.actions.again ? 185 : 0;
    // a long card shrinks so the buttons stay on screen
    const below = rows + 270;
    const k = Math.min(1, (f.h - 80 - below) / cardH);
    card.scale.set(k);
    // the card and its buttons as one block, centred a little above the middle (a short card
    // otherwise floats in the top two thirds over an empty floor)
    const top = blockTop(f.h, k * cardH, below - 70);
    card.position.set(f.w / 2, top + (k * cardH) / 2);
    card.addChild(panel(CARD_W, cardH));
    let y = -cardH / 2 + 40;
    for (const [view, h] of zones) {
      view.y = y;
      card.addChild(view);
      this.parts.push([view, y]);
      y += h + GAP;
    }
    this.view.addChild(card);
    const buttons = new Container();
    this.buttons(buttons, f.w / 2, card.y + (k * cardH) / 2 + 130, false);
    this.view.addChild(buttons);
    this.parts.push([buttons, 0]);
  }

  /** Landscape: one panel in the middle, the run on the left, what it brought on the right, the buttons in a row under both. */
  private wide(f: UiFrame, run: Part[], haul: Part[]): void {
    const plan = widePlan(INNER_W, run.map(([, h]) => h), haul.map(([, h]) => h));
    const card = new Container();
    card.scale.set(fitScale(plan.w, plan.h, f.w, f.h, 40));
    card.position.set(f.w / 2, f.h / 2);
    const rule = { color: COLORS.outline, alpha: 0.45, width: 4 };
    card.addChild(
      panel(plan.w, plan.h),
      new Graphics()
        .moveTo(0, plan.top).lineTo(0, plan.bottom).stroke(rule)
        .moveTo(-plan.w / 2 + WIDE_PAD, plan.ruleY).lineTo(plan.w / 2 - WIDE_PAD, plan.ruleY).stroke(rule),
    );
    const place = (parts: Part[], x: number, tops: number[]) => parts.forEach(([view], i) => {
      view.position.set(x, tops[i]);
      card.addChild(view);
      this.parts.push([view, tops[i]]);
    });
    place(run, plan.leftX, plan.left);
    place(haul, plan.rightX, plan.right);
    const buttons = new Container();
    this.buttons(buttons, 0, plan.rowY, true);
    card.addChild(buttons);
    this.parts.push([buttons, 0]);
    this.view.addChild(card);
  }

  /**
   * The leading button over the second (or one alone), the second beside the ad offer, from `y`
   * down; in a `row` (landscape) all of them side by side centred on `x`, the leading one last.
   */
  private buttons(c: Container, x: number, y: number, row: boolean): void {
    const busy = this.offer === 'playing';
    const n = this.actions.waiting();
    const lobby = { text: n > 0 ? t('results.collect', { n }) : t('results.lobby'), act: () => this.actions.next() };
    const again = this.actions.again;
    const replay = again && { text: t(this.reward.firstClear ? 'results.nextChapter' : 'results.again'), act: again };
    // a first clear goes on; a loss with something to collect leads there, else straight back in
    const rows = !replay ? [lobby] : this.reward.firstClear || n === 0 ? [replay, lobby] : [lobby, replay];
    this.primary = rows[0].act;
    // the buttons left to right as a row sets them, [view, width]
    const line: [Container, number][] = [];
    let first: Container | null = null;
    if (rows.length === 2) {
      first = button(rows[0].text, 640, 150, rows[0].act, { fill: COLORS.saffron });
      first.position.set(x, y);
      if (busy) first.eventMode = 'none';
      else if (this.keys) keyCap(first, 640, 150, t('common.keyEnter'));
      c.addChild(rows[0] === lobby ? spot('lobby', first) : first);
      y += 185;
    }
    const last = rows[rows.length - 1];
    // under a leading button, the second (and the ad offer, which matches it) step back
    const fill = rows.length === 2 ? COLORS.panelLocked : COLORS.saffron;
    const pair = this.offer === 'offered' || this.offer === 'playing';
    // the pair spans the card's width, so the ad's label (beside its badge) keeps a readable size
    const w = pair ? 450 : 640;
    const adText = busy ? '…' : t('results.double');
    // the pair share one font size: the size at which the longer label (with the ad's badge) fits
    let size = 52;
    if (pair) {
      const probe = button(adText, w, 140, () => {}, { video: !busy, size });
      const other = button(last.text, w, 140, () => {}, { size });
      size *= Math.min(buttonLabel(probe).scale.x, buttonLabel(other).scale.x);
      probe.destroy({ children: true });
      other.destroy({ children: true });
    }
    const second = button(last.text, w, 140, last.act, { fill, size });
    second.position.set(pair ? x + w / 2 + 10 : x, y);
    if (busy) second.eventMode = 'none';
    // Escape is the lobby's key; Play again under Collect has none
    else if (this.keys && (rows.length === 1 || last === lobby)) keyCap(second, w, 140, t(rows.length === 1 ? 'common.keyEnter' : 'common.keyEsc'));
    c.addChild(last === lobby ? spot('lobby', second) : second);
    if (pair) {
      // the same size, font and colour as its neighbour (CrazyGames' rewarded-ad rules)
      const ad = button(adText, w, 140, () => void this.playAd(), { fill: busy ? COLORS.panelLocked : fill, video: !busy, size });
      ad.position.set(x - w / 2 - 10, y);
      if (busy) ad.eventMode = 'none';
      c.addChild(ad);
      line.push([ad, w]);
    }
    line.push([second, w]);
    if (!row) return;
    // one row along the panel's foot: the ones that step back, then the leading one at the right end
    if (first) line.push([first, 640]);
    const xs = rowCentres(line.map(([, bw]) => bw), ROW_GAP);
    line.forEach(([b], i) => b.position.set(x + xs[i], first ? y - 185 : y));
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

  /** Enter: the first key press while the parts come in shows them all, the next takes the first button; Escape goes to the lobby. */
  key(code: string, repeat: boolean): void {
    const k = panelKey(code, repeat);
    if (!this.keys || !k || k === 'pause' || this.offer === 'playing') return;
    if (k === 'ok' && this.age < REVEALED && partIn(this.age, this.parts.length - 1) < 1) return this.skip();
    playTap();
    if (k === 'ok') this.primary();
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
