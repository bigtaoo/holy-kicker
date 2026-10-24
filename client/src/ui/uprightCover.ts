import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { UiFrame } from './uiLayout';
import { COLORS, label } from './widgets';

// The cover over everything while a touch-only phone is held sideways (viewport.ts
// wantsUpright): the shell's background, a phone standing up with a turning arrow, and the ask.
// It takes taps, so nothing under it does; a run behind it waits on its pause panel.

/** How far the cover reaches past the frame, over the side bars a sideways screen has. */
const BLEED = 4000;

export function uprightCover(f: UiFrame): Container {
  const view = new Container();
  view.position.set(f.x, f.y);
  view.scale.set(f.scale);
  view.addChild(new Graphics().rect(-BLEED, -BLEED, f.w + 2 * BLEED, f.h + 2 * BLEED).fill(COLORS.bg));
  const phone = new Graphics()
    .roundRect(-110, -190, 220, 380, 36).fill(COLORS.panel).stroke({ color: COLORS.saffron, width: 12 })
    .roundRect(-40, 150, 80, 14, 7).fill(COLORS.saffron)
    // the turning arrow beside it, a quarter circle with its head at the top
    .moveTo(-258, -132).arc(0, 0, 290, Math.PI * 1.15, Math.PI * 1.6).stroke({ color: COLORS.text, width: 14 })
    .poly([-64, -320, -10, -284, -78, -246]).fill(COLORS.text);
  phone.position.set(f.w / 2, f.h / 2 - 160);
  const ask = label(t('common.rotate'), 72, COLORS.text, { wordWrap: true, wordWrapWidth: f.w - 160, breakWords: true, align: 'center' });
  ask.position.set(f.w / 2, f.h / 2 + 260);
  view.addChild(phone, ask);
  view.eventMode = 'static';
  return view;
}
