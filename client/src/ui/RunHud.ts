import { Container, Graphics, type Text } from 'pixi.js';
import { getLocale, localeName, t, type Locale } from '../i18n';
import { BuildBar, type IconSheet } from './buildBar';
import { buildKey, type BuildSlot, type Charge } from './buildSlots';
import { cardPanel, type CardPanel } from './cardPanel';
import { panelKey } from './panelKeys';
import type { DownInfo } from './deathInfo';
import { downPanel, type Down } from './downPanel';
import { languagePanel } from './languagePanel';
import type { CardText } from './cardText';
import type { StoryLine } from './story';
import type { TutorialStep } from './tutorial';
import { tutorialHint, type TutorialHint } from './tutorialHint';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, backdrop, button, fit, keyCap, label, meter, panel, playTap } from './widgets';
import { RECORD_BURST } from './recordBurst';
import { RecordBurstView } from './recordBurstView';

// The in-run overlay: the experience bar and level, the build strip with the spells' recharge, the wave counter,
// the fast-forward toggle, a pause button and the pause panel (resume, language, report a problem, give up), a banner when a wave starts, the level-up cards, and the death panel (downPanel.ts).
// Under the wave counter, the wave the last run of the chapter fell on, until this run passes it.

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
  /** Switches the language and keeps it (once its table is fetched); the HUD redraws itself in it. */
  setLanguage(locale: Locale): Promise<void>;
  /** Asks what went wrong and sends it with the run's replay; null where a report could go nowhere. */
  report: (() => Promise<ReportOutcome>) | null;
}

export type ReportOutcome = 'sent' | 'failed' | 'cancelled';
/** The pause panel's report button: ready, waiting for the text box or the server, or done. */
type Reporting = 'idle' | 'busy' | 'sent' | 'failed';

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
  /** What the death panel says about the fall, and the last run's fall (0 for none shown). */
  private downInfo: DownInfo | null = null;
  private lastFall = 0;
  private lastFallText: Text | null = null;
  /** The wave banner; `record` makes its cheer line the new-record burst, `age` its seconds up. */
  private banner: { lines: [string, number][]; story: StoryLine | null; t: number; record: boolean; age: number } | null = null;
  private burst: RecordBurstView | null = null;
  /** Rebuilt with every layout, like the rest of the HUD. */
  private xpView: Container | null = null;
  private xpGauge: ReturnType<typeof meter> | null = null;
  private levelText: Text | null = null;
  private xp = { level: 1, share: 0 };
  /** The open level-up cards, and whether one was tapped (waiting for the engine). */
  private offer: CardText[] | null = null;
  private offerTitle = '';
  /** Seconds since the cards opened (they rise in locked), and their panel in this layout. */
  private offerAge = 0;
  private cards: CardPanel | null = null;
  /** The card the keys would take, on a desktop. */
  private cardFocus = { focus: 0 };
  private picked = false;
  private build: BuildBar | null = null;
  private slots: readonly BuildSlot[] = [];
  private slotsKey = '';
  /** The first run's hint, and its animated view. */
  private tutorial: TutorialStep = 'done';
  private hint: TutorialHint | null = null;
  private clock = 0;

  constructor(
    private readonly total: number,
    /** Hard mode: the wave counter says so. */
    private readonly hard: boolean,
    private readonly actions: RunActions,
    private readonly icons: IconSheet,
    /** A desktop: the move hint shows the arrow keys. */
    private readonly keys = false,
    /** Whether the keys reach the game now: the move hint asks for a click first when they do not. */
    private readonly keysReach: () => boolean = () => true,
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
    const fell = (this.lastFallText = label('', 48, COLORS.dim, { stroke: { color: COLORS.outline, width: 8 } }));
    fell.anchor.set(0, 0.5);
    fell.position.set(40, 370);
    this.view.addChild(wave, fell);
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
    this.hint = null;
    if (this.tutorial !== 'done' && !this.paused && !this.down && !this.offer) this.drawTutorial(f);
    this.bannerView = null;
    this.burst = null;
    // a panel covers the middle, so a banner then waits out its time unseen
    if (this.banner && !this.paused && !this.down && !this.offer) this.drawBanner(f);
    this.cards = null;
    if (this.offer) {
      this.cards = cardPanel(f, this.offerTitle, this.offer, this.icons, (i) => this.pickCard(i), this.keys ? this.cardFocus : null);
      this.cards.update(this.offerAge);
      this.view.addChild(this.cards.view);
    }
    if (this.paused) this.pausePanel(f);
    if (this.down) {
      this.view.addChild(downPanel(f, this.down, this.downInfo, this.wave, { revive: () => void this.playRevive(), giveUp: () => this.actions.giveUp() }, this.icons, this.keys));
    }
  }

  /** Wave 0 is the sandbox, which has no counter and no levels. */
  setWave(wave: number): void {
    this.wave = wave;
    if (!this.waveText) return;
    this.waveText.visible = wave > 0;
    this.waveText.text = t(this.hard ? 'run.hardWave' : 'run.wave', { wave, total: this.total });
    if (this.xpView) this.xpView.visible = wave > 0;
    if (this.build) this.build.view.visible = wave > 0;
    this.setLastFall(this.lastFall);
  }

  /** The wave the chapter's last run fell on, under the wave counter; 0 hides it. */
  setLastFall(wave: number): void {
    this.lastFall = wave;
    if (!this.lastFallText) return;
    this.lastFallText.visible = wave > 0 && this.wave > 0;
    this.lastFallText.text = t('run.lastFall', { wave });
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
    this.xpGauge?.set(this.xp.share);
    if (this.levelText && this.levelText.text !== t('run.level', { level })) this.levelText.text = t('run.level', { level });
  }

  /** The level-up or shrine cards under `title`; they stay until hideOffer. */
  showOffer(title: string, cards: CardText[]): void {
    this.offer = cards;
    this.offerTitle = title;
    this.offerAge = 0;
    this.cardFocus.focus = 0;
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
   * a boss its line of the story; `cheer` (passing the last run's fall) under the number.
   */
  announce(wave: number, warning: string | null, story: StoryLine | null = null, cheer: string | null = null, record = false): void {
    const lines: [string, number][] = [[t('run.waveStart', { wave }), 96]];
    if (cheer) lines.push([cheer, record ? 88 : 72]);
    if (warning) lines.push([warning, 64]);
    const time = Math.max(story ? STORY_TIME : BANNER_TIME, record ? RECORD_BURST.length : 0);
    this.banner = { lines, story, t: time, record: record && !!cheer, age: 0 };
    this.relayout();
  }

  /** One short line across the middle: a card the first run took for a player still standing. */
  gained(name: string): void {
    this.banner = { lines: [[t('card.gained', { name }), 72]], story: null, t: BANNER_TIME, record: false, age: 0 };
    this.relayout();
  }

  /** A story line alone across the middle (the monk's, once the chapter boss fell). */
  speak(story: StoryLine): void {
    this.banner = { lines: [], story, t: STORY_TIME, record: false, age: 0 };
    this.relayout();
  }

  /** The hero went down: offers a free revive, the rewarded ad or nothing; `info` says what did it (kept when left out). */
  showDown(offer: ReviveOffer, info: DownInfo | null = this.downInfo): void {
    this.downInfo = info;
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
    this.hint?.update(this.clock);
    // a banner waits out the card choice
    if (!this.banner || this.offer) return;
    this.banner.t -= dt;
    this.banner.age += dt;
    this.burst?.update(this.banner.age);
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
    const w = f.w - 260;
    const gauge = meter(w, this.xp.share, COLORS.jade, XP_H);
    gauge.view.position.set(40 + w / 2, XP_Y);
    this.xpGauge = gauge;
    const level = label('', 52, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    level.anchor.set(1, 0.5);
    level.position.set(f.w - 40, XP_Y);
    this.levelText = level;
    bar.addChild(gauge.view, level);
    this.view.addChild(bar);
    this.setXp(this.xp.level, this.xp.share);
  }

  /**
   * A key went down: the level-up cards take it while they are open; otherwise Enter revives and
   * Escape gives up on the death panel, Escape (or P) pauses and resumes, and Enter resumes.
   */
  key(code: string, repeat: boolean): void {
    if (this.offer && !this.paused && !this.down) return this.cards?.key(code, repeat);
    const k = panelKey(code, repeat);
    if (!k || this.down === 'playing') return;
    if (this.down) {
      if (k === 'ok' && this.down !== 'none') void this.playRevive();
      else if (k === 'back') this.actions.giveUp();
      else return;
    } else if (this.languages) {
      if (k !== 'back') return;
      this.languages = false;
      this.relayout();
    } else if (this.paused) this.setPaused(false);
    else if (k !== 'ok') this.setPaused(true);
    else return;
    playTap();
  }

  private pickCard(index: number): void {
    if (this.picked) return;
    this.picked = true;
    this.actions.pick(index);
  }

  /** The hint low on the screen, under the fight (tutorialHint.ts). */
  private drawTutorial(f: UiFrame): void {
    const hint = (this.hint = tutorialHint(this.tutorial, f.w, this.keys ? this.keysReach : null));
    hint.view.position.set(f.w / 2, f.h * (this.tutorial === 'move' ? 0.78 : 0.88));
    hint.update(this.clock);
    this.view.addChild(hint.view);
  }

  private drawBanner(f: UiFrame): void {
    const box = new Container();
    box.position.set(f.w / 2, f.h * 0.36);
    let y = 0;
    for (const [i, [text, size]] of this.banner!.lines.entries()) {
      const l = fit(label(text, size, size > 90 ? COLORS.text : COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), f.w - 80);
      if (i === 1 && this.banner!.record) {
        // the new record: the cheer line pops in over turning rays and a burst of sparks
        const burst = (this.burst = new RecordBurstView(l));
        burst.view.y = y;
        burst.update(this.banner!.age);
        box.addChildAt(burst.view, 0);
      } else {
        l.y = y;
        box.addChild(l);
      }
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
    const resume = button(t('run.resume'), 560, 150, () => this.setPaused(false));
    if (this.keys) keyCap(resume, 560, 150, t('common.keyEsc'));
    items.push([resume, 190]);
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
        void this.actions.setLanguage(l).then(() => !this.view.destroyed && this.relayout());
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
