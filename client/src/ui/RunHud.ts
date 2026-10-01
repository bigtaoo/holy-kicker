import { Container, type Text } from 'pixi.js';
import { t } from '../i18n';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, backdrop, button, label, panel } from './widgets';

// The in-run overlay: the wave counter, a pause button and the pause panel.

export interface RunActions {
  pause(): void;
  resume(): void;
  giveUp(): void;
}

export class RunHud implements Screen {
  readonly view = new Container();
  private frame: UiFrame | null = null;
  private waveText: Text | null = null;
  private wave = 1;
  private paused = false;

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
    const pause = button('II', 120, 120, () => this.setPaused(true), { fill: COLORS.panel, size: 52 });
    pause.position.set(f.w - 90, 300);
    this.view.addChild(wave, pause);
    if (this.paused) this.pausePanel(f);
  }

  setWave(wave: number): void {
    this.wave = wave;
    if (this.waveText) this.waveText.text = t('run.wave', { wave, total: this.total });
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.actions.pause();
    else this.actions.resume();
    if (this.frame) this.layout(this.frame);
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
}
