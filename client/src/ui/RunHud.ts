import { Container, Graphics, type Text } from 'pixi.js';
import { t, type Locale } from '../i18n';
import { BuildBar, type IconSheet } from './buildBar';
import { buildKey, type BuildSlot, type Charge } from './buildSlots';
import { cardPanel, type CardNudgeState, type CardPanel } from './cardPanel';
import { panelKey } from './panelKeys';
import type { DownInfo } from './deathInfo';
import { downPanel, type Down } from './downPanel';
import { spin } from './spinner';
import { languagePanel } from './languagePanel';
import { HudColumn } from './hudColumn';
import { hudRows } from './hudLayout';
import { GIVE_UP_WAIT, pausePanel, type PauseSwitches } from './pausePanel';
import type { CardText } from './cardText';
import type { StoryLine } from './story';
import type { Dir8 } from './gatherNudge';
import { tutorialHint, type HintStep, type TutorialHint } from './tutorialHint';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, button, label, meter, playTap } from './widgets';
import { RECORD_BURST } from './recordBurst';
import type { RecordBurstView } from './recordBurstView';
import { waveBanner } from './waveBanner';

// The in-run overlay: the experience bar and level, the build strip with the spells' recharge, the wave counter,
// the fast-forward toggle, a pause button and the pause panel (pausePanel.ts), a banner when a wave starts, the level-up cards, and the death panel (downPanel.ts).
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
  /** The pause panel's sound switches (pausePanel.ts); null for none. */
  switches: PauseSwitches | null;
}

export type ReportOutcome = 'sent' | 'failed' | 'cancelled';
/** The pause panel's report button: ready, waiting for the text box or the server, or done. */
type Reporting = 'idle' | 'busy' | 'sent' | 'failed';

export type ReviveOffer = 'none' | 'free' | 'checking' | 'ad';

/** Seconds a wave banner stays (longer with a story line to read), the last of them fading. */
const BANNER_TIME = 2;
const STORY_TIME = 4;
const BANNER_FADE = 0.5;
const XP_H = 30;
const XP_Y = 52;
const BUILD_Y = 150;

export class RunHud implements Screen {
  readonly view = new Container();
  /** What is always up, built by layout; relayout rebuilds `overlay` alone (all of it was a hitch on slow phones). */
  private readonly base = new Container();
  private readonly overlay = new Container();
  private buttons: { pause: Container; fast: Container } | null = null;
  private frame: UiFrame | null = null;
  /** The wave counter and the dim lines under it. */
  private readonly column: HudColumn;
  private bannerView: Container | null = null;
  private wave = 0;
  private paused = false;
  /** The run plays at double speed. */
  private fast = false;
  /** The language picker over the pause panel. */
  private languages = false;
  private reporting: Reporting = 'idle';
  /** Seconds the armed give-up button still waits for its second tap; null when not armed. */
  private giveUpArmed: number | null = null;
  private down: Down | null = null;
  /** The death panel's waiting ring, turned each frame; null when it shows none. */
  private downSpinner: Graphics | null = null;
  /** What the death panel says about the fall, and the last run's fall (0 for none shown). */
  private downInfo: DownInfo | null = null;
  /** The wave banner; `record` makes its cheer line the new-record burst, `age` its seconds up. */
  private banner: { lines: [string, number][]; story: StoryLine | null; t: number; record: boolean; age: number } | null = null;
  private burst: RecordBurstView | null = null;
  /** Rebuilt with every layout, like the rest of the base. */
  private xpView: Container | null = null;
  private xpGauge: ReturnType<typeof meter> | null = null;
  private levelText: Text | null = null;
  private xp = { level: 1, share: 0 };
  /** The level levelText shows (0 for none yet): the label is formatted only when it changes. */
  private levelShown = 0;
  /** The open level-up cards, and whether one was tapped (waiting for the engine). */
  private offer: CardText[] | null = null;
  private offerTitle = '';
  /** Seconds since the cards opened (they rise in locked), and their panel in this layout. */
  private offerAge = 0;
  private cards: CardPanel | null = null;
  /** The card the keys would take, on a desktop. */
  private cardFocus = { focus: 0 };
  private cardNudge: CardNudgeState = { suggest: 0, touched: false, tagged: false };
  private picked = false;
  private build: BuildBar | null = null;
  private slots: readonly BuildSlot[] = [];
  private slotsKey = '';
  /** The first run's hint, and its animated view. */
  private tutorial: HintStep = 'done';
  private gatherDir: Dir8 = 2;
  private hint: TutorialHint | null = null;
  private clock = 0;

  constructor(
    total: number,
    /** Hard mode: the wave counter says so. */
    hard: boolean,
    private readonly actions: RunActions,
    private readonly icons: IconSheet,
    /** A desktop: the move hint shows the arrow keys. */
    private readonly keys = false,
    /** Whether the keys reach the game now: the move hint asks for a click first when they do not. */
    private readonly keysReach: () => boolean = () => true,
  ) {
    this.column = new HudColumn(total, hard);
    this.view.addChild(this.base, this.overlay);
  }

  layout(f: UiFrame): void {
    this.frame = f;
    this.base.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.column.layout(this.base, hudRows(f).waveY); // over the boss bar, its corner by the frame's shape
    this.xpBar(f);
    const build = (this.build = new BuildBar(this.icons));
    build.view.position.set(f.w / 2, BUILD_Y);
    build.draw(this.slots);
    this.base.addChild(build.view);
    this.setWave(this.wave);
    const pause = button('II', 120, 120, () => this.setPaused(true), { fill: COLORS.panel, size: 52, plain: true });
    pause.position.set(f.w - 90, hudRows(f).buttonsY);
    this.buttons = { pause, fast: this.fastButton(f) };
    this.base.addChild(pause, this.buttons.fast);
    this.drawOverlay(f);
  }

  /** The hint, banner and panels over the HUD; the pause and fast buttons hide under a panel. */
  private drawOverlay(f: UiFrame): void {
    this.overlay.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (this.buttons) this.buttons.pause.visible = this.buttons.fast.visible = !this.down && !this.offer;
    this.hint = null;
    if (this.tutorial !== 'done' && !this.paused && !this.down && !this.offer) this.drawTutorial(f);
    this.bannerView = null;
    this.burst = null;
    // a panel covers the middle, so a banner then waits out its time unseen
    if (this.banner && !this.paused && !this.down && !this.offer) this.drawBanner(f);
    this.cards = null;
    if (this.offer) {
      this.cards = cardPanel(f, this.offerTitle, this.offer, this.icons, (i) => this.pickCard(i), this.keys ? this.cardFocus : null, this.cardNudge);
      this.cards.update(this.offerAge);
      this.overlay.addChild(this.cards.view);
    }
    if (this.paused) this.pausePanel(f);
    this.downSpinner = null;
    if (this.down) {
      const panel = downPanel(f, this.down, this.downInfo, this.wave, { revive: () => void this.playRevive(), giveUp: () => this.actions.giveUp() }, this.icons, this.keys);
      this.downSpinner = panel.spinner;
      this.overlay.addChild(panel.view);
    }
  }

  /** Wave 0 is the sandbox, which has no counter and no levels. */
  setWave(wave: number): void {
    this.wave = wave;
    this.column.setWave(wave);
    if (this.xpView) this.xpView.visible = wave > 0;
    if (this.build) this.build.view.visible = wave > 0;
  }

  /** The wave the chapter's last run fell on, under the wave counter; 0 hides it. */
  setLastFall(wave: number): void {
    this.column.setLastFall(wave);
  }

  /** The next chest's wave under the counter (and the last fall); 0 hides it. */
  setNextChest(wave: number): void {
    this.column.setNextChest(wave);
  }

  /** The run's clock under the counter against a best in tenths (0 for none); null hides it. */
  setTimer(best: number | null): void {
    this.column.setTimer(best);
  }

  /** The simulated tick the clock reads. */
  setTick(tick: number): void {
    this.column.setTick(tick);
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
    if (!this.frame || !this.buttons || this.view.destroyed) return;
    const old = this.buttons.fast;
    const fresh = (this.buttons.fast = Object.assign(this.fastButton(this.frame), { visible: old.visible }));
    this.base.addChildAt(fresh, this.base.getChildIndex(old));
    old.destroy({ children: true });
  }

  /** The level and how far the experience is toward the next one, 0..1. */
  setXp(level: number, share: number): void {
    this.xp.level = level;
    this.xp.share = Math.max(0, Math.min(1, share));
    this.xpGauge?.set(this.xp.share);
    if (this.levelText && level !== this.levelShown) this.levelText.text = t('run.level', { level: (this.levelShown = level) });
  }

  /**
   * The level-up or shrine cards under `title`, a hand tapping card `suggest` for a player who
   * hesitates and, if `tagged`, a tag on it from the start; they stay until hideOffer.
   */
  showOffer(title: string, cards: CardText[], suggest = 0, tagged = false): void {
    this.cardNudge = { suggest, touched: false, tagged };
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
   * a boss its line of the story; `cheer` (passing the last run's fall) under the number, and
   * `chest` says the wave just cleared earned a chest.
   */
  announce(wave: number, warning: string | null, story: StoryLine | null = null, cheer: string | null = null, record = false, chest = false): void {
    const lines: [string, number][] = [[t('run.waveStart', { wave }), 96]];
    if (cheer) lines.push([cheer, record ? 88 : 72]);
    if (chest) lines.push([t('run.chestEarned'), 64]);
    if (warning) lines.push([warning, 64]);
    const time = Math.max(story ? STORY_TIME : BANNER_TIME, record ? RECORD_BURST.length : 0);
    this.showBanner({ lines, story, t: time, record: record && !!cheer, age: 0 });
  }

  /** One short line across the middle: a card the first run took for a player still standing. */
  gained(name: string): void {
    this.showBanner({ lines: [[t('card.gained', { name }), 72]], story: null, t: BANNER_TIME, record: false, age: 0 });
  }

  /** A story line alone across the middle (the monk's, once the chapter boss fell). */
  speak(story: StoryLine): void {
    this.showBanner({ lines: [], story, t: STORY_TIME, record: false, age: 0 });
  }

  /** Swaps the banner alone, keeping the hint or panels under it. */
  private showBanner(banner: NonNullable<RunHud['banner']>): void {
    this.banner = banner;
    if (!this.frame || this.view.destroyed) return;
    this.bannerView?.destroy({ children: true });
    this.bannerView = null;
    this.burst = null;
    if (!this.paused && !this.down && !this.offer) this.drawBanner(this.frame);
  }

  /** The hero went down: offers a free revive, the rewarded ad (`checking` while the host says whether one can play)
   *  or nothing; `info` says what did it (kept when left out). */
  showDown(offer: ReviveOffer, info: DownInfo | null = this.downInfo): void {
    this.downInfo = info;
    this.down = offer === 'free' ? 'free' : offer === 'ad' ? 'offered' : offer === 'checking' ? 'checking' : 'none';
    this.paused = false;
    this.relayout();
  }

  hideDown(): void {
    this.down = null;
    this.relayout();
  }

  /** The first run's hint or the gather nudge to show ('done' for none), the nudge pointing `dir`. */
  setTutorial(step: HintStep, dir: Dir8 = 2): void {
    if (step === this.tutorial && dir === this.gatherDir) return;
    this.tutorial = step;
    this.gatherDir = dir;
    this.relayout();
  }

  update(dt: number): void {
    this.build?.update(dt);
    this.clock += dt;
    if (this.downSpinner) spin(this.downSpinner, this.clock);
    if (this.cards) {
      this.offerAge += dt;
      this.cards.update(this.offerAge);
    }
    this.hint?.update(this.clock);
    if (this.giveUpArmed !== null && (this.giveUpArmed -= dt) <= 0) {
      this.giveUpArmed = null;
      this.relayout();
    }
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

  /** The pause panel is up. */
  get pauseShown(): boolean {
    return this.paused;
  }

  /** The game went to the background: opens the pause panel unless a panel is already up. */
  pauseForHost(): void {
    if (!this.paused && !this.down && !this.offer) this.setPaused(true);
  }

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.drawOverlay(this.frame);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.languages = false;
    this.giveUpArmed = null;
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
    b.position.set(f.w - 230, hudRows(f).buttonsY);
    b.label = 'fast';
    return b;
  }

  private xpBar(f: UiFrame): void {
    const bar = (this.xpView = new Container());
    const w = f.w - 260;
    const gauge = meter(w, this.xp.share, COLORS.trim, XP_H);
    gauge.view.position.set(40 + w / 2, XP_Y);
    this.xpGauge = gauge;
    const level = label('', 52, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
    level.anchor.set(1, 0.5);
    level.position.set(f.w - 40, XP_Y);
    this.levelText = level;
    this.levelShown = 0;
    bar.addChild(gauge.view, level);
    this.base.addChild(bar);
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
      if (k === 'ok') void this.playRevive();
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
    const hint = (this.hint = tutorialHint(this.tutorial, f.w, this.keys ? this.keysReach : null, this.gatherDir));
    hint.view.position.set(f.w / 2, f.h * (this.tutorial === 'move' || this.tutorial === 'gather' ? 0.78 : 0.88));
    hint.update(this.clock);
    this.overlay.addChild(hint.view);
  }

  private drawBanner(f: UiFrame): void {
    const b = this.banner!;
    const { box, burst } = waveBanner(f.w, b.lines, b.story, b.record, b.age);
    box.position.set(f.w / 2, f.h * 0.36);
    this.burst = burst;
    this.bannerView = box;
    this.overlay.addChild(box);
  }

  private pausePanel(f: UiFrame): void {
    const r = this.reporting;
    const report = this.actions.report ? {
      text: r === 'busy' ? t('report.sending') : t('run.report'),
      busy: r === 'busy',
      note: r === 'sent' || r === 'failed' ? { text: t(r === 'sent' ? 'report.sent' : 'report.failed'), ok: r === 'sent' } : null,
    } : null;
    this.overlay.addChild(pausePanel(f.w, f.h, { keys: this.keys, report, confirming: this.giveUpArmed !== null }, this.actions.switches, {
      resume: () => this.setPaused(false),
      languages: () => {
        this.languages = true;
        this.relayout();
      },
      report: () => void this.sendReport(),
      giveUp: () => this.tapGiveUp(),
    }, () => this.relayout()));
    if (this.languages) {
      this.overlay.addChild(languagePanel(f.w, f.h, (l) => {
        this.languages = false;
        void this.actions.setLanguage(l).then(() => this.frame && !this.view.destroyed && this.layout(this.frame));
        this.relayout();
      }, () => {
        this.languages = false;
        this.relayout();
      }));
    }
  }

  /** Give up on the pause panel: the first tap arms it for GIVE_UP_WAIT seconds, the second ends the run. */
  private tapGiveUp(): void {
    if (this.giveUpArmed !== null) {
      this.giveUpArmed = null;
      this.actions.giveUp();
      return;
    }
    this.giveUpArmed = GIVE_UP_WAIT;
    this.relayout();
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
