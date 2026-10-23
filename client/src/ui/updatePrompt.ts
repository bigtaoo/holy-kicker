import { Container, Graphics } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import type { AppUpdates } from '../platform/types';
import type { UiFrame } from './uiLayout';
import { UpdateFlow, type UpdateStep } from './updateFlow';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The hot-update panel over the lobby (updateFlow.ts decides when): an update is ready, Update or
// Later; then the download's bar, and at its end the game restarts by itself; or the failure,
// with Retry or Close. Shell.ts keeps it over the screen and tells it when the lobby is free.

const BOX_W = 900;
const BAR_W = 720;
const BAR_H = 64;

export class UpdatePrompt {
  private readonly flow: UpdateFlow;
  private view: Container | null = null;
  private frame: UiFrame | null = null;
  private key = '';
  private dirty = false;

  /** `layer` holds the screens; the panel stays its top child. */
  constructor(updates: AppUpdates, private readonly layer: Container) {
    this.flow = new UpdateFlow(updates, () => (this.dirty = true));
  }

  hidden(): void {
    this.flow.hidden();
  }

  /** Each frame: `idle` the lobby with nothing over it, `key` the screen size, `frame` its UI frame. */
  update(idle: boolean, key: string, frame: () => UiFrame): void {
    this.flow.poll(idle);
    if (key !== this.key) {
      this.key = key;
      this.frame = null;
      this.dirty = true;
    }
    if (this.dirty) this.draw(frame);
    // over the screen, which may have been put up after it
    else if (this.view && this.layer.children[this.layer.children.length - 1] !== this.view) this.layer.addChild(this.view);
  }

  private draw(frame: () => UiFrame): void {
    this.dirty = false;
    this.view?.destroy({ children: true });
    this.view = null;
    const s = this.flow.state;
    if (s.step === 'none') return;
    const f = (this.frame ??= frame());
    this.view = updatePanel(s, f.w, f.h, {
      update: () => this.flow.update(),
      later: () => this.flow.later(),
    });
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.layer.addChild(this.view);
  }
}

interface UpdateActions {
  update(): void;
  later(): void;
}

function updatePanel(s: Exclude<UpdateStep, { step: 'none' }>, w: number, h: number, a: UpdateActions): Container {
  const root = new Container();
  root.addChild(backdrop(w, h, 0.7));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const boxH = 640;
  const top = -boxH / 2;
  box.addChild(panel(BOX_W, boxH));
  const title = s.step === 'offer' ? t('update.title') : s.step === 'failed' ? t('update.failedTitle')
    : s.f >= 1 ? t('update.restarting') : t('update.downloading');
  const head = fit(label(title, 64, s.step === 'failed' ? COLORS.danger : COLORS.saffron), BOX_W - 80);
  head.y = top + 90;
  box.addChild(head);
  const body = s.step === 'offer' ? t('update.body') : s.step === 'failed' ? t('update.failed') : t('update.wait');
  const text = fit(label(body, 48, COLORS.text, { wordWrap: true, wordWrapWidth: BOX_W - 120, breakWords: true }), BOX_W - 120, 200);
  text.y = top + 250;
  box.addChild(text);
  if (s.step === 'downloading') {
    const bar = progressBar(s.f);
    bar.y = top + 430;
    box.addChild(bar);
  } else {
    const yes = button(s.step === 'offer' ? t('update.now') : t('update.retry'), 380, 130, a.update, { fill: COLORS.saffron, size: 52 });
    const no = button(s.step === 'offer' ? t('update.later') : t('update.close'), 340, 130, a.later, { fill: COLORS.panelLocked });
    yes.position.set(-BOX_W / 2 + 60 + 190, top + boxH - 120);
    no.position.set(BOX_W / 2 - 60 - 170, top + boxH - 120);
    box.addChild(yes, no);
  }
  if (s.step === 'offer') {
    const version = label(t('update.version', { v: s.version }), 48, COLORS.dim);
    version.y = top + 400;
    box.addChild(version);
  }
  root.addChild(box);
  return root;
}

/** The download's bar, with its percent on it. */
function progressBar(f: number): Container {
  const c = new Container();
  const fill = Math.max(0, Math.min(1, f));
  c.addChild(new Graphics()
    .roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2).fill(COLORS.bg).stroke({ color: COLORS.outline, width: 6 }));
  if (fill > 0) {
    const fw = Math.max(BAR_H, BAR_W * fill);
    c.addChild(new Graphics().roundRect(-BAR_W / 2, -BAR_H / 2, fw, BAR_H, BAR_H / 2).fill(COLORS.saffron));
  }
  const pct = label(t('update.percent', { n: formatAmount(Math.round(fill * 100)) }), 48, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } });
  c.addChild(pct);
  return c;
}
