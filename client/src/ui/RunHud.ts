import { Container, type Text } from 'pixi.js';
import { t } from '../i18n';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The in-run overlay: the wave counter, a pause button and the pause panel, a banner when a
// wave starts, and the death panel (revive with an ad, or give up).

export interface RunActions {
  pause(): void;
  resume(): void;
  giveUp(): void;
  /** Plays the rewarded ad and revives; resolves whether it paid. */
  revive(): Promise<boolean>;
}

/** Death panel: no revive to offer, offered, or the ad is playing. */
type Down = 'none' | 'offered' | 'playing';

/** Seconds a wave banner stays, the last of them fading. */
const BANNER_TIME = 2;
const BANNER_FADE = 0.5;

export class RunHud implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private waveText: Text | null = null;
  private bannerView: Container | null = null;
  private wave = 0;
  private paused = false;
  private down: Down | null = null;
  private banner: { lines: [string, number][]; t: number } | null = null;

  constructor(
    private readonly total: number,
    private readonly actions: RunActions,
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
    this.setWave(this.wave);
    this.view.addChild(wave);
    if (!this.down) {
      const pause = button('II', 120, 120, () => this.setPaused(true), { fill: COLORS.panel, size: 52 });
      pause.position.set(f.w - 90, 300);
      this.view.addChild(pause);
    }
    this.bannerView = null;
    // a panel covers the middle, so a banner then waits out its time unseen
    if (this.banner && !this.paused && !this.down) this.drawBanner(f);
    if (this.paused) this.pausePanel(f);
    if (this.down) this.downPanel(f, this.down);
  }

  /** Wave 0 is the sandbox, which has no counter. */
  setWave(wave: number): void {
    this.wave = wave;
    if (!this.waveText) return;
    this.waveText.visible = wave > 0;
    this.waveText.text = t('run.wave', { wave, total: this.total });
  }

  /** A banner across the middle: the wave number and, for elite and boss waves, a warning. */
  announce(wave: number, warning: string | null): void {
    const lines: [string, number][] = [[t('run.waveStart', { wave }), 96]];
    if (warning) lines.push([warning, 64]);
    this.banner = { lines, t: BANNER_TIME };
    this.relayout();
  }

  /** The hero went down; `canRevive` offers the rewarded ad. */
  showDown(canRevive: boolean): void {
    this.down = canRevive ? 'offered' : 'none';
    this.paused = false;
    this.relayout();
  }

  hideDown(): void {
    this.down = null;
    this.relayout();
  }

  update(dt: number): void {
    if (!this.banner) return;
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

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.actions.pause();
    else this.actions.resume();
    this.relayout();
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
    box.eventMode = 'none';
    this.bannerView = box;
    this.view.addChild(box);
  }

  private pausePanel(f: UiFrame): void {
    this.view.addChild(backdrop(f.w, f.h));
    const box = new Container();
    box.position.set(f.w / 2, f.h / 2);
    const title = label(t('run.paused'), 72);
    title.y = -200;
    const resume = button(t('run.resume'), 560, 150, () => this.setPaused(false));
    const giveUp = button(t('run.giveUp'), 560, 130, () => this.actions.giveUp(), { fill: COLORS.panelLocked });
    giveUp.y = 190;
    box.addChild(panel(760, 640), title, resume, giveUp);
    this.view.addChild(box);
  }

  private downPanel(f: UiFrame, down: Down): void {
    this.view.addChild(backdrop(f.w, f.h));
    const box = new Container();
    box.position.set(f.w / 2, f.h / 2);
    const title = label(t('run.down'), 80, COLORS.text);
    title.y = down === 'none' ? -110 : -200;
    box.addChild(panel(800, down === 'none' ? 440 : 640), title);
    const giveUp = button(t('run.giveUp'), 560, 130, () => this.actions.giveUp(), { fill: COLORS.panelLocked });
    giveUp.y = down === 'none' ? 70 : 190;
    if (down !== 'none') {
      const playing = down === 'playing';
      const revive = button(playing ? '…' : t('run.revive'), 640, 160, () => void this.playRevive(), {
        fill: playing ? COLORS.panelLocked : COLORS.jade,
        textFill: COLORS.outline,
      });
      if (playing) revive.eventMode = giveUp.eventMode = 'none';
      box.addChild(revive);
    }
    box.addChild(giveUp);
    this.view.addChild(box);
  }

  private async playRevive(): Promise<void> {
    if (this.down !== 'offered') return;
    this.down = 'playing';
    this.relayout();
    const paid = await this.actions.revive();
    if (this.view.destroyed) return;
    // a skipped or unfilled ad keeps the offer; a paid one closes the panel
    if (paid) this.down = null;
    else this.down = 'offered';
    this.relayout();
  }
}
