import { Container } from 'pixi.js';
import { LOCALES, getLocale, localeName, t, type Locale } from '../i18n';
import { COLORS, backdrop, button, label, panel } from './widgets';

// The language picker, from the lobby's settings and the pause panel: every language by its
// own name in two columns, the current one saffron. Picking one closes it (the caller redraws
// in the new language); Back keeps the language.

const COLS = 2;
const BW = 380;
const BH = 110;
const GAP = 24;

export function languagePanel(w: number, h: number, pick: (locale: Locale) => void, close: () => void): Container {
  const view = new Container();
  view.addChild(backdrop(w, h, 0.7));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const rows = Math.ceil(LOCALES.length / COLS);
  const gridH = rows * BH + (rows - 1) * GAP;
  const boxH = gridH + 420;
  box.addChild(panel(COLS * BW + (COLS - 1) * GAP + 100, boxH));
  const title = label(t('settings.language'), 64);
  title.y = -boxH / 2 + 90;
  box.addChild(title);
  const current = getLocale();
  const top = -boxH / 2 + 190;
  LOCALES.forEach((l, i) => {
    const on = l === current;
    const b = button(localeName(l), BW, BH, () => pick(l), { fill: on ? COLORS.saffron : COLORS.panelLocked, textFill: on ? COLORS.outline : COLORS.text, size: 48 });
    const col = i % COLS;
    // an odd one out sits in the middle of the last row
    const alone = i === LOCALES.length - 1 && col === 0;
    b.x = alone ? 0 : (col - (COLS - 1) / 2) * (BW + GAP);
    b.y = top + Math.floor(i / COLS) * (BH + GAP) + BH / 2;
    box.addChild(b);
  });
  const back = button(t('common.back'), 400, 110, close, { fill: COLORS.panelLocked });
  back.y = boxH / 2 - 100;
  box.addChild(back);
  view.addChild(box);
  return view;
}
