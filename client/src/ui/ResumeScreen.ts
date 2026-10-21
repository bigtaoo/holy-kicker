import { Container, type Texture } from 'pixi.js';
import { t } from '../i18n';
import { chapterName } from '../i18n/chapterName';
import { menuCover } from './lobbyBars';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, button, fit, label, panel } from './widgets';

// On launch, when the last chapter run was left unfinished (meta/resume.ts): which run it was,
// and whether to go on with it or give it up. Giving up settles it like the pause panel's
// give-up, so the waves already cleared still pay.

export interface ResumeActions {
  resume(): void;
  giveUp(): void;
}

export interface ResumeInfo {
  chapter: number;
  hard: boolean;
  wave: number;
  waves: number;
}

export class ResumeScreen implements Screen {
  readonly view = new Container();
  /** A choice was made; later taps do nothing while it loads. */
  private chosen = false;
  private frame: UiFrame | null = null;
  private backdrop: Texture | null = null;

  constructor(
    private readonly run: ResumeInfo,
    private readonly actions: ResumeActions,
    /** The lobby's baked menu courtyard (menuBackdrop) to sit on once it is in; null for the flat background. */
    backdrop: Promise<Texture | null> = Promise.resolve(null),
  ) {
    void backdrop.then((tex) => {
      this.backdrop = tex;
      if (tex && this.frame && !this.view.destroyed) this.layout(this.frame);
    });
  }

  layout(f: UiFrame): void {
    this.frame = f;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.view.addChild(menuCover(f, this.backdrop));

    const { chapter: n, hard, wave, waves } = this.run;
    const box = new Container();
    box.position.set(f.w / 2, f.h / 2);
    box.addChild(panel(860, 820));
    const name = chapterName(n);
    const lines: [Container, number][] = [
      [fit(label(t('run.unfinished'), 72), 760), -320],
      [fit(label(hard ? t('lobby.hardTitle', { n, name }) : t('lobby.chapterTitle', { n, name }), 56, hard ? COLORS.danger : COLORS.saffron), 760), -200],
      [fit(label(t(hard ? 'run.hardWave' : 'run.wave', { wave, total: waves }), 48, COLORS.dim), 760), -120],
      [label(t('run.unfinishedAsk'), 48, COLORS.text, { wordWrap: true, wordWrapWidth: 720, breakWords: true, align: 'center' }), -10],
    ];
    for (const [view, y] of lines) {
      view.y = y;
      box.addChild(view);
    }
    // both ways out are plain to see; going on is the main one
    const resume = button(t('common.continue'), 640, 150, () => this.choose(() => this.actions.resume()));
    resume.y = 140;
    const giveUp = button(t('run.giveUp'), 640, 120, () => this.choose(() => this.actions.giveUp()), { fill: COLORS.panelLocked });
    giveUp.y = 310;
    box.addChild(resume, giveUp);
    this.view.addChild(box);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private choose(then: () => void): void {
    if (this.chosen) return;
    this.chosen = true;
    then();
  }
}
