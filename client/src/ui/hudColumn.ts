import type { Container, Text } from 'pixi.js';
import { t } from '../i18n';
import { clockSecs, shownSecond } from './clearTime';
import { COLORS, label } from './widgets';

const STROKE = { stroke: { color: COLORS.outline, width: 8 } };
/** The wave counter's height, and the step between the dim lines stacked under it. */
const WAVE_Y = 300;
const FIRST_Y = 370;
const STEP = 60;

/**
 * The HUD's top-left column: the wave counter, then the run's clock (where it is shown), the
 * wave the last run fell on and the next chest's wave, each line closing up when one above hides.
 * Its values outlive the layouts that rebuild its labels.
 */
export class HudColumn {
  private wave = 0;
  private waveText: Text | null = null;
  /** The best time the clock is held against in tenths (0 for none), null when it is not shown. */
  private best: number | null = null;
  private tick = 0;
  /** The second the clock shows (-1 for none yet): its label is formatted only when it changes. */
  private second = -1;
  private timerText: Text | null = null;
  private lastFall = 0;
  private lastFallText: Text | null = null;
  /** The wave of the next chest this run can earn (0 for none). */
  private nextChest = 0;
  private goalText: Text | null = null;

  constructor(
    private readonly total: number,
    /** Hard mode: the wave counter says so. */
    private readonly hard: boolean,
  ) {}

  /** New labels into a freshly cleared HUD view. */
  layout(view: Container): void {
    const wave = (this.waveText = label('', 52, COLORS.text, STROKE));
    wave.position.set(40, WAVE_Y);
    const timer = (this.timerText = label('', 48, COLORS.dim, STROKE));
    const fell = (this.lastFallText = label('', 48, COLORS.dim, STROKE));
    const goal = (this.goalText = label('', 48, COLORS.gold, STROKE));
    for (const l of [wave, timer, fell, goal]) {
      l.anchor.set(0, 0.5);
      l.x = 40;
    }
    view.addChild(wave, timer, fell, goal);
    this.second = -1;
    this.refresh();
  }

  /** Wave 0 is the sandbox, which shows none of the column. */
  setWave(wave: number): void {
    this.wave = wave;
    this.refresh();
  }

  /** The run's clock against a best time in tenths (0 for the time alone); null hides it. */
  setTimer(best: number | null): void {
    this.best = best;
    this.second = -1;
    this.refresh();
  }

  /** The simulated tick the clock reads; it stops with the sim (pause, cards) and follows fast-forward. */
  setTick(tick: number): void {
    this.tick = tick;
    if (this.timerText?.visible && shownSecond(tick) !== this.second) this.timerLabel();
  }

  /** The wave the chapter's last run fell on; 0 hides it. */
  setLastFall(wave: number): void {
    this.lastFall = wave;
    this.refresh();
  }

  /** The next chest's wave; 0 hides it. */
  setNextChest(wave: number): void {
    this.nextChest = wave;
    this.refresh();
  }

  private refresh(): void {
    const { waveText, timerText, lastFallText, goalText } = this;
    if (!waveText || !timerText || !lastFallText || !goalText) return;
    const on = this.wave > 0;
    waveText.visible = on;
    waveText.text = t(this.hard ? 'run.hardWave' : 'run.wave', { wave: this.wave, total: this.total });
    timerText.visible = on && this.best !== null;
    if (timerText.visible && this.second < 0) this.timerLabel();
    lastFallText.visible = on && this.lastFall > 0;
    lastFallText.text = t('run.lastFall', { wave: this.lastFall });
    goalText.visible = on && this.nextChest > 0;
    goalText.text = t('run.nextChest', { wave: this.nextChest });
    let y = FIRST_Y;
    for (const l of [timerText, lastFallText, goalText]) {
      l.y = y;
      if (l.visible) y += STEP;
    }
  }

  private timerLabel(): void {
    if (!this.timerText) return;
    this.second = shownSecond(this.tick);
    const time = clockSecs(this.second * 10);
    this.timerText.text = this.best ? t('run.timerBest', { time, best: clockSecs(this.best) }) : time;
  }
}
