import { Container, type Application } from 'pixi.js';
import { t } from '../i18n';
import { computeViewport } from '../game/viewport';
import type { PrivacyUi } from '../net/privacyChoice';
import type { Insets } from '../platform/types';
import { uiFrame } from './uiLayout';
import { COLORS, button, label, panel } from './widgets';

// What the player sees of the privacy rules (meta/privacy.ts), with as few taps as the law allows:
// outside the EEA a toast that needs none, shown once over the first run; inside it a card at the
// foot of the lobby that asks once and keeps nothing else from working while it waits.

/** Seconds before the toast fades in (the run is just appearing), how long it stays, its fades. */
const TOAST_AFTER = 2;
const TOAST_FOR = 8;
const FADE = 0.6;

/** Shows the one-time data toast over whatever is on screen; it cannot be tapped and goes by itself. */
export function privacyToast(app: Application, insets: () => Insets): void {
  const view = new Container();
  view.eventMode = 'none';
  const text = label(t('privacy.toast'), 44, COLORS.text, { wordWrap: true, wordWrapWidth: 920, breakWords: true });
  view.addChild(panel(text.width + 80, text.height + 50), text);
  const layer = new Container();
  layer.addChild(view);
  let age = 0;
  const tick = () => {
    age += app.ticker.deltaMS / 1000;
    const left = TOAST_AFTER + TOAST_FOR - age;
    if (left <= 0) {
      app.ticker.remove(tick);
      layer.destroy({ children: true });
      return;
    }
    const f = uiFrame(computeViewport(app.screen.width, app.screen.height), insets());
    layer.position.set(f.x, f.y);
    layer.scale.set(f.scale);
    // under the move hint (RunHud's tutorial at 0.7 of the height), above the bottom edge
    view.position.set(f.w / 2, f.h * 0.88);
    layer.alpha = Math.max(0, Math.min(1, (age - TOAST_AFTER) / FADE, left / FADE));
    // the run and its HUD are added after this; stay on top of them
    if (app.stage.children[app.stage.children.length - 1] !== layer) app.stage.addChild(layer);
  };
  app.ticker.add(tick);
}

/** `p` with `after` run after each answer (the lobby redraws itself then). */
export function watched(p: PrivacyUi | null, after: () => void): PrivacyUi | null {
  return p && {
    asking: () => p.asking(),
    sharing: () => p.sharing(),
    set: (on) => {
      p.set(on);
      after();
    },
    openPolicy: () => p.openPolicy(),
    id: () => p.id(),
  };
}

/** The lobby's consent card, centred on `y`: allow, no thanks, or read the policy first. */
export function consentCard(w: number, y: number, privacy: PrivacyUi): Container {
  const card = new Container();
  card.position.set(w / 2, y);
  const text = label(t('privacy.ask'), 40, COLORS.text, { wordWrap: true, wordWrapWidth: 940, breakWords: true });
  const h = text.height + 210;
  card.addChild(panel(1000, h));
  text.y = -h / 2 + 30 + text.height / 2;
  card.addChild(text);
  const row = h / 2 - 85;
  const pick = (on: boolean) => () => privacy.set(on);
  const allow = button(t('privacy.allow'), 340, 110, pick(true), { fill: COLORS.saffron, textFill: COLORS.outline, size: 48 });
  const decline = button(t('privacy.decline'), 320, 110, pick(false), { fill: COLORS.panelLocked, size: 48 });
  const policy = button(t('privacy.link'), 240, 110, () => privacy.openPolicy(), { fill: COLORS.panelLocked, size: 40 });
  allow.position.set(-290, row);
  decline.position.set(60, row);
  policy.position.set(350, row);
  card.addChild(allow, decline, policy);
  return card;
}
