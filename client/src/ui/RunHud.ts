import { Container, Graphics, Sprite, Texture, type Text } from 'pixi.js';
import { getLocale, localeName, t, type Locale } from '../i18n';
import { BuildBar, type IconSheet } from './buildBar';
import { buildKey, type BuildSlot, type Charge } from './buildSlots';
import { cardPanel, type CardPanel } from './cardPanel';
import { languagePanel } from './languagePanel';
import type { CardText } from './cardText';
import type { StoryLine } from './story';
import type { TutorialStep } from './tutorial';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The in-run overlay: the experience bar and level, the build strip with the spells' recharge, the wave counter,
// the fast-forward toggle, a pause button and the pause panel (resume, language, report a problem, give up), a banner when a wave starts, the level-up cards, and the death panel (revive
// free from training or with an ad, or give up).

export interface RunActions {
  pause(): void;
  resume(): void;
  /** Runs the sim at double speed, or back at normal. */
  setFast(fast: boolean): void;
  giveUp(): void;
  /** Revives, free or after the rewarded ad; resolves whether it did. */
  revive(): Promise<boolean>;
  /** Takes card `index` of the level-up offer. */
  pick(index: number): void;
  /** Switches the language and keeps it; the HUD redraws itself in it. */
  setLanguage(locale: Locale): void;
  /** Asks what went wrong and sends it with the run's replay; null where a report could go nowhere. */
  report: (() => Promise<ReportOutcome>) | null;
}

export type ReportOutcome = 'sent' | 'failed' | 'cancelled';
/** The pause panel's report button: ready, waiting for the text box or the server, or done. */
type Reporting = 'idle' | 'busy' | 'sent' | 'failed';

/** Death panel: no revive to offer, a free one (training), the ad offered, or the ad playing. */
type Down = 'none' | 'free' | 'offered' | 'playing';
export type ReviveOffer = 'none' | 'free' | 'ad';

/** Seconds a wave banner stays (longer with a story line to read), the last of them fading. */
const BANNER_TIME = 2;
const STORY_TIME = 4;
const BANNER_FADE = 0.5;
const XP_H = 30;
const XP_Y = 52;
const BUILD_Y = 150;

export class RunHud implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private waveText: Text | null = null;
  private bannerView: Container | null = null;
  private wave = 0;
  private paused = false;
  /** The run plays at double speed. */
  private fast = false;
  /** The language picker over the pause panel. */
  private languages = false;
  private reporting: Reporting = 'idle';
  private down: Down | null = null;
  private banner: { lines: [string, number][]; story: StoryLine | null; t: number } | null = null;
  /** Rebuilt with every layout, like the rest of the HUD. */
  private xpView: Container | null = null;
  private xpFill: Sprite | null = null;
  private xpWidth = 0;
  private levelText: Text | null = null;
  private xp = { level: 1, share: 0 };
  /** The open level-up cards, and whether one was tapped (waiting for the engine). */
  private offer: CardText[] | null = null;
  private offerTitle = '';
  /** Seconds since the cards opened (they rise in locked), and their panel in this layout. */
  private offerAge = 0;
  private cards: CardPanel | null = null;
  private picked = false;
  private build: BuildBar | null = null;
  private slots: readonly BuildSlot[] = [];
  private slotsKey = '';
  /** The first run's hint, and the hand that sways on the move hint. */
  private tutorial: TutorialStep = 'done';
  private hand: Container | null = null;
  private clock = 0;

  constructor(
    private readonly total: number,
    /** Hard mode: the wave counter says so. */
    private readonly hard: boolean,
    private readonly actions: RunActions,
    private readonly icons: IconSheet,
    /** The move hint also names the keyboard. */
    private readonly keys = false,
  ) {}

  layout(f: UiFrame): void {
    this.frame = f;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    // below the boss health bar, which spans the top
    const wave = label('', 52, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    wave.anchor.set(0, 0.5);
    wave.position.set(40, 300);
    this.waveText = wave;
    this.view.addChild(wave);
    this.xpBar(f);
    const build = (this.build = new BuildBar(this.icons));
    build.view.position.set(f.w / 2, BUILD_Y);
    build.draw(this.slots);
    this.view.addChild(build.view);
    this.setWave(this.wave);
    if (!this.down && !this.offer) {
      const pause = button('II', 120, 120, () => this.setPaused(true), { fill: COLORS.panel, size: 52 });
      pause.position.set(f.w - 90, 300);
      this.view.addChild(pause, this.fastButton(f));
    }
    this.hand = null;
    if (this.tutorial !== 'done' && !this.paused && !this.down && !this.offer) this.drawTutorial(f);
    this.bannerView = null;
    // a panel covers the middle, so a banner then waits out its time unseen
    if (this.banner && !this.paused && !this.down && !this.offer) this.drawBanner(f);
    this.cards = null;
    if (this.offer) {
      this.cards = cardPanel(f, this.offerTitle, this.offer, this.icons, (i) => this.pickCard(i));
      this.cards.update(this.offerAge);
      this.view.addChild(this.cards.view);
    }
    if (this.paused) this.pausePanel(f);
    if (this.down) this.downPanel(f, this.down);
  }

  /** Wave 0 is the sandbox, which has no counter and no levels. */
  setWave(wave: number): void {
    this.wave = wave;
    if (!this.waveText) return;
    this.waveText.visible = wave > 0;
    this.waveText.text = t(this.hard ? 'run.hardWave' : 'run.wave', { wave, total: this.total });
    if (this.xpView) this.xpView.visible = wave > 0;
    if (this.build) this.build.view.visible = wave > 0;
  }

  /** The hero's build; the strip is redrawn only when it looks different. */
  setBuild(slots: readonly BuildSlot[]): void {
    const key = buildKey(slots);
    if (key === this.slotsKey) return;
    this.slotsKey = key;
    this.slots = slots;
    this.build?.draw(slots);
  }

  /** Each spell's recharge on the build strip (spellCharges), every frame. */
  setCharges(charges: readonly (Charge | null)[]): void {
    this.build?.setCharges(charges);
  }

  /** Starts the run fast or not (the last run's choice); the toggle then keeps it. */
  setFast(fast: boolean): void {
    this.fast = fast;
    this.actions.setFast(fast);
    this.relayout();
  }

  /** The level and how far the experience is toward the next one, 0..1. */
  setXp(level: number, share: number): void {
    this.xp = { level, share: Math.max(0, Math.min(1, share)) };
    if (this.xpFill) this.xpFill.width = this.xpWidth * this.xp.share;
    if (this.levelText && this.levelText.text !== t('run.level', { level })) this.levelText.text = t('run.level', { level });
  }

  /** The level-up or shrine cards under `title`; they stay until hideOffer. */
  showOffer(title: string, cards: CardText[]): void {
    this.offer = cards;
    this.offerTitle = title;
    this.offerAge = 0;
    this.picked = false;
    this.paused = false;
    this.relayout();
  }

  hideOffer(): void {
    this.offer = null;
    this.relayout();
  }

  /**
   * A banner across the middle: the wave number, for elite and boss waves a warning, and around
   * a boss its line of the story.
   */
  announce(wave: number, warning: string | null, story: StoryLine | null = null): void {
    const lines: [string, number][] = [[t('run.waveStart', { wave }), 96]];
    if (warning) lines.push([warning, 64]);
    this.banner = { lines, story, t: story ? STORY_TIME : BANNER_TIME };
    this.relayout();
  }

  /** A story line alone across the middle (the monk's, once the chapter boss fell). */
  speak(story: StoryLine): void {
    this.banner = { lines: [], story, t: STORY_TIME };
    this.relayout();
  }

  /** The hero went down: offers a free revive, the rewarded ad or nothing. */
  showDown(offer: ReviveOffer): void {
    this.down = offer === 'free' ? 'free' : offer === 'ad' ? 'offered' : 'none';
    this.paused = false;
    this.relayout();
  }

  hideDown(): void {
    this.down = null;
    this.relayout();
  }

  /** The first run's hint to show ('done' for none). */
  setTutorial(step: TutorialStep): void {
    if (step === this.tutorial) return;
    this.tutorial = step;
    this.relayout();
  }

  update(dt: number): void {
    this.build?.update(dt);
    this.clock += dt;
    if (this.cards) {
      this.offerAge += dt;
      this.cards.update(this.offerAge);
    }
    if (this.hand) this.hand.x = Math.sin(this.clock * 4) * 120;
    // a banner waits out the card choice
    if (!this.banner || this.offer) return;
    this.banner.t -= dt;
    if (this.banner.t <= 0) {
      this.banner = null;
      this.bannerView?.destroy({ children: true });
      this.bannerView = null;
    } else if (this.bannerView) {
      this.bannerView.alpha = Math.min(1, this.banner.t / BANNER_FADE);
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  /** The game went to the background: opens the pause panel unless a panel is already up. */
  pauseForHost(): void {
    if (!this.paused && !this.down && !this.offer) this.setPaused(true);
  }

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.languages = false;
    if (this.reporting !== 'busy') this.reporting = 'idle';
    if (paused) this.actions.pause();
    else this.actions.resume();
    this.relayout();
  }

  /** The fast-forward toggle left of the pause button: two arrows, lit while the run plays fast. */
  private fastButton(f: UiFrame): Container {
    const b = button('', 120, 120, () => this.setFast(!this.fast), { fill: this.fast ? COLORS.saffron : COLORS.panel });
    const ink = this.fast ? COLORS.outline : COLORS.text;
    const arrows = new Graphics();
    for (const x of [-26, 4]) arrows.poly([x, -24, x + 30, 0, x, 24]).fill(ink);
    b.addChild(arrows);
    b.position.set(f.w - 230, 300);
    return b;
  }

  private xpBar(f: UiFrame): void {
    const bar = (this.xpView = new Container());
    const fill = (this.xpFill = new Sprite(Texture.WHITE));
    const x = 40;
    const w = (this.xpWidth = f.w - 260);
    const back = new Sprite(Texture.WHITE);
    back.tint = COLORS.outline;
    back.width = w + 12;
    back.height = XP_H + 12;
    back.position.set(x - 6, XP_Y - XP_H / 2 - 6);
    fill.tint = 0x7fd8ff;
    fill.height = XP_H;
    fill.position.set(x, XP_Y - XP_H / 2);
    const level = label('', 52, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    level.anchor.set(1, 0.5);
    level.position.set(f.w - 40, XP_Y);
    this.levelText = level;
    bar.addChild(back, fill, level);
    this.view.addChild(bar);
    this.setXp(this.xp.level, this.xp.share);
  }

  private pickCard(index: number): void {
    if (this.picked) return;
    this.picked = true;
    this.actions.pick(index);
  }

  /** The hint low on the screen, under the hero: a swaying finger to move, then a line. */
  private drawTutorial(f: UiFrame): void {
    const box = new Container();
    box.position.set(f.w / 2, f.h * 0.7);
    box.eventMode = 'none';
    const lines = this.tutorial === 'move' ? [t('tutorial.move'), ...(this.keys ? [t('tutorial.keys')] : [])] : [t('tutorial.auto'), t('tutorial.zen'), t('tutorial.gems')];
    lines.forEach((text, i) => {
      const l = fit(label(text, i === 0 ? 60 : 48, i === 0 ? COLORS.text : COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), f.w - 80);
      l.y = i * 80;
      box.addChild(l);
    });
    if (this.tutorial === 'move') {
      const hand = (this.hand = new Container());
      hand.y = -170;
      hand.addChild(
        new Graphics().roundRect(-150, -6, 300, 12, 6).fill({ color: COLORS.text, alpha: 0.35 }),
        new Graphics().circle(0, 0, 46).fill({ color: COLORS.text, alpha: 0.85 }).stroke({ color: COLORS.outline, width: 8 }),
      );
      box.addChild(hand);
    }
    this.view.addChild(box);
  }

  private drawBanner(f: UiFrame): void {
    const box = new Container();
    box.position.set(f.w / 2, f.h * 0.36);
    let y = 0;
    for (const [text, size] of this.banner!.lines) {
      const l = fit(label(text, size, size > 80 ? COLORS.text : COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), f.w - 80);
      l.y = y;
      box.addChild(l);
      y += size + 24;
    }
    const story = this.banner!.story;
    if (story) {
      const who = label(t(story.who), 44, COLORS.saffron, { stroke: { color: COLORS.outline, width: 8 } });
      who.y = y + 16;
      const say = label(t('story.quote', { text: t(story.say) }), 52, COLORS.text, {
        stroke: { color: COLORS.outline, width: 8 },
        wordWrap: true,
        wordWrapWidth: f.w - 160,
        breakWords: true,
      });
      say.anchor.set(0.5, 0);
      say.y = who.y + 44;
      box.addChild(who, say);
    }
    box.eventMode = 'none';
    this.bannerView = box;
    this.view.addChild(box);
  }

  private pausePanel(f: UiFrame): void {
    this.view.addChild(backdrop(f.w, f.h));
    const box = new Container();
    box.position.set(f.w / 2, f.h / 2);
    // stacked top down: [view, height it takes]
    const items: [Container, number][] = [[label(t('run.paused'), 72), 150]];
    items.push([button(t('run.resume'), 560, 150, () => this.setPaused(false)), 190]);
    const lang = button(`${t('run.language')} · ${localeName(getLocale())}`, 560, 120, () => {
      this.languages = true;
      this.relayout();
    }, { fill: COLORS.panelLocked, size: 48 });
    items.push([lang, 150]);
    if (this.actions.report) {
      const busy = this.reporting === 'busy';
      const report = button(busy ? t('report.sending') : t('run.report'), 560, 120, () => void this.sendReport(), { fill: COLORS.panelLocked, size: 48 });
      if (busy) report.eventMode = 'none';
      items.push([report, 150]);
      if (this.reporting === 'sent' || this.reporting === 'failed') {
        const note = label(t(this.reporting === 'sent' ? 'report.sent' : 'report.failed'), 40, this.reporting === 'sent' ? COLORS.jade : COLORS.dim, {
          wordWrap: true, wordWrapWidth: 640, breakWords: true,
        });
        items.push([note, 110]);
      }
    }
    items.push([button(t('run.giveUp'), 560, 120, () => this.actions.giveUp(), { fill: COLORS.panelLocked }), 150]);
    const h = items.reduce((sum, [, step]) => sum + step, 0) + 80;
    box.addChild(panel(760, h));
    let y = -h / 2 + 40;
    for (const [view, step] of items) {
      view.y = y + step / 2;
      box.addChild(view);
      y += step;
    }
    this.view.addChild(box);
    if (this.languages) {
      this.view.addChild(languagePanel(f.w, f.h, (l) => {
        this.languages = false;
        this.actions.setLanguage(l);
        this.relayout();
      }, () => {
        this.languages = false;
        this.relayout();
      }));
    }
  }

  /** The text box, then the send; the panel says how it went. */
  private async sendReport(): Promise<void> {
    if (!this.actions.report || this.reporting === 'busy') return;
    this.reporting = 'busy';
    this.relayout();
    const outcome = await this.actions.report();
    if (this.view.destroyed) return;
    this.reporting = outcome === 'cancelled' ? 'idle' : outcome;
    this.relayout();
  }

  private downPanel(f: UiFrame, down: Down): void {
    this.view.addChild(backdrop(f.w, f.h));
    const box = new Container();
    box.position.set(f.w / 2, f.h / 2);
    const title = label(t('run.down'), 80, COLORS.text);
    title.y = down === 'none' ? -110 : -200;
    box.addChild(panel(800, down === 'none' ? 440 : 640), title);
    // the way out matches the revive in size, font and colour, so declining the ad never looks
    // disabled (CrazyGames' rewarded-ad rules)
    const giveUp = button(t('run.giveUp'), 640, 150, () => this.actions.giveUp());
    giveUp.y = down === 'none' ? 70 : 190;
    if (down !== 'none') {
      const playing = down === 'playing';
      const free = down === 'free';
      const revive = button(playing ? '…' : free ? t('run.reviveFree') : t('run.revive'), 640, 150, () => void this.playRevive(), {
        fill: playing ? COLORS.panelLocked : COLORS.saffron,
        video: !playing && !free,
      });
      if (playing) revive.eventMode = giveUp.eventMode = 'none';
      box.addChild(revive);
    }
    box.addChild(giveUp);
    this.view.addChild(box);
  }

  private async playRevive(): Promise<void> {
    if (this.down !== 'offered' && this.down !== 'free') return;
    const was = this.down;
    this.down = 'playing';
    this.relayout();
    const paid = await this.actions.revive();
    if (this.view.destroyed) return;
    // a skipped or unfilled ad keeps the offer; a paid one closes the panel
    if (paid) this.down = null;
    else this.down = was;
    this.relayout();
  }
}
