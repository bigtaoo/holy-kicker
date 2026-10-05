import { Container, Graphics } from 'pixi.js';
import { MONK_IDS, MONK_PASSIVE, MONK_STATS, type MonkId } from '@hk/engine';
import { t } from '../i18n';
import { monkPrice, ownsMonk } from '../meta/monks';
import type { SaveData } from '../meta/save';
import { iconSprite, type IconSheet } from './buildBar';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The monk panel, opened from the lobby's avatar (docs/content.md "Monks"): one row per monk
// with his portrait (art/icons/monks), his passive and stats, and a button to play as him or
// to buy him with jade. Changes go to the lobby, which stores them and redraws.

export interface MonkActions {
  choose(id: MonkId): void;
  buy(id: MonkId): void;
  close(): void;
}

const W = 940;
const ROW_H = 400;
/** The novice is drawn smaller, as in the run (Game.ts MONK_HEIGHT). */
const PORTRAIT: Record<MonkId, number> = { kicker: 330, fat: 330, novice: 290 };

/** The numbers a monk's stats line shows, all as positive amounts (the text carries the sign). */
function statArgs(id: MonkId): Record<string, number> {
  const s = MONK_STATS[id];
  return { hp: Math.abs(s.maxHp ?? 0), speed: Math.abs(s.speed ?? 0), xp: s.xp ?? 0, n: MONK_PASSIVE.dodgeEvery };
}

function row(save: SaveData, id: MonkId, icons: IconSheet, a: MonkActions): Container {
  const c = new Container();
  const chosen = save.monk === id;
  const owned = ownsMonk(save, id);
  c.addChild(panel(W - 60, ROW_H - 20, chosen ? 0x3a3326 : COLORS.panelLocked));
  if (chosen) c.addChild(new Graphics().roundRect(-(W - 60) / 2, -(ROW_H - 20) / 2, W - 60, ROW_H - 20, 28).stroke({ color: COLORS.saffron, width: 8 }));
  const portrait = iconSprite(icons, `monk_${id}`, PORTRAIT[id]);
  if (portrait) {
    portrait.position.set(-W / 2 + 200, (330 - PORTRAIT[id]) / 2);
    if (!owned) portrait.alpha = 0.6;
    c.addChild(portrait);
  }
  const textX = -W / 2 + 380;
  const textW = W / 2 - 50 - textX;
  const line = (text: string, size: number, fill: number, y: number, wrap = false) => {
    const style = wrap ? { align: 'left' as const, wordWrap: true, breakWords: true, wordWrapWidth: textW } : { align: 'left' as const };
    const l = fit(label(text, size, fill, style), textW);
    l.anchor.set(0, 0);
    l.position.set(textX, y);
    c.addChild(l);
    return l;
  };
  const name = line(t(`monk.${id}.name`), 60, chosen ? COLORS.saffron : COLORS.text, -170);
  const role = line(t(`monk.${id}.role`, statArgs(id)), 38, COLORS.text, name.y + name.height + 8, true);
  line(t(`monk.${id}.stats`, statArgs(id)), 38, COLORS.dim, role.y + role.height + 8);
  const bx = textX + 170;
  const by = 128;
  if (chosen) {
    const l = label(t('monk.playing'), 48, COLORS.saffron);
    l.position.set(bx, by);
    c.addChild(l);
  } else if (owned) {
    const b = button(t('monk.play'), 340, 96, () => a.choose(id), { size: 48 });
    b.position.set(bx, by);
    c.addChild(b);
  } else {
    const afford = save.jade >= monkPrice(id);
    const b = button(t('shop.price', { jade: monkPrice(id) }), 340, 96, () => a.buy(id), {
      fill: afford ? COLORS.jade : COLORS.panelLocked, textFill: afford ? COLORS.outline : COLORS.dim, size: 48,
    });
    b.position.set(bx, by);
    c.addChild(b);
  }
  return c;
}

export function monkPanel(w: number, h: number, save: SaveData, icons: IconSheet, a: MonkActions): Container {
  const view = new Container();
  view.addChild(backdrop(w, h));
  const boxH = 140 + MONK_IDS.length * ROW_H + 150;
  const box = new Container();
  box.position.set(w / 2, h / 2);
  box.addChild(panel(W, boxH));
  const title = label(t('monk.title'), 64);
  title.y = -boxH / 2 + 75;
  box.addChild(title);
  MONK_IDS.forEach((id, i) => {
    const r = row(save, id, icons, a);
    r.y = -boxH / 2 + 140 + ROW_H * (i + 0.5);
    box.addChild(r);
  });
  const back = button(t('common.back'), 400, 110, () => a.close(), { fill: COLORS.panelLocked });
  back.y = boxH / 2 - 85;
  box.addChild(back);
  view.addChild(box);
  return view;
}
