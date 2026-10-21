import { Container, Graphics } from 'pixi.js';
import { MONK_IDS, MONK_PASSIVE, MONK_STATS, type MonkId } from '@hk/engine';
import { t } from '../i18n';
import { monkPrice, ownsMonk } from '../meta/monks';
import type { SaveData } from '../meta/save';
import { iconSprite, type IconSheet } from './buildBar';
import { breakAtPause } from './weeklyPage';
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
/** A row's least height; a row grows when its passive wraps past the button (long translations). */
const ROW_H = 380;
const ROW_GAP = 20;
/** The novice is drawn smaller, as in the run (Game.ts MONK_HEIGHT). */
const PORTRAIT: Record<MonkId, number> = { kicker: 310, fat: 310, novice: 270 };

/** The numbers a monk's stats line shows, all as positive amounts (the text carries the sign). */
function statArgs(id: MonkId): Record<string, number> {
  const s = MONK_STATS[id];
  return { hp: Math.abs(s.maxHp ?? 0), speed: Math.abs(s.speed ?? 0), xp: s.xp ?? 0, n: MONK_PASSIVE.dodgeEvery };
}

/** A monk's row with its top edge at y 0, and its height. */
function row(save: SaveData, id: MonkId, icons: IconSheet, a: MonkActions): { c: Container; h: number } {
  const c = new Container();
  const chosen = save.monk === id;
  const owned = ownsMonk(save, id);
  const textX = -W / 2 + 340;
  const textW = W / 2 - 50 - textX;
  const line = (text: string, size: number, fill: number, y: number, wrap = false) => {
    const l = label(text, size, fill, { align: 'left' });
    // the stats break after a comma, never inside "speed +20%"; the passive wraps freely
    if (wrap && l.width > textW && !breakAtPause(l, text, textW)) {
      Object.assign(l.style, { wordWrap: true, breakWords: true, wordWrapWidth: textW });
    }
    fit(l, textW);
    l.anchor.set(0, 0);
    l.position.set(textX, y);
    c.addChild(l);
    return l;
  };
  const name = line(t(`monk.${id}.name`), 60, chosen ? COLORS.saffron : COLORS.text, 20);
  const role = line(t(`monk.${id}.role`, statArgs(id)), 44, COLORS.text, name.y + name.height + 8, true);
  const stats = line(t(`monk.${id}.stats`, statArgs(id)), 44, COLORS.dim, role.y + role.height + 10, true);
  // the button (96 high) sits under the text, at the row's foot unless the text runs lower
  const bx = textX + 170;
  const by = Math.max(ROW_H - 62, stats.y + stats.height + 16 + 48);
  const h = Math.max(ROW_H, by + 48 + 14);
  const back = panel(W - 60, h, chosen ? 0x3a3326 : COLORS.panelLocked);
  back.y = h / 2;
  c.addChildAt(back, 0);
  if (chosen) c.addChildAt(new Graphics().roundRect(-(W - 60) / 2, 0, W - 60, h, 28).stroke({ color: COLORS.saffron, width: 8 }), 1);
  const portrait = iconSprite(icons, `monk_${id}`, PORTRAIT[id]);
  if (portrait) {
    portrait.position.set(-W / 2 + 185, h / 2 + (310 - PORTRAIT[id]) / 2);
    if (!owned) portrait.alpha = 0.6;
    c.addChild(portrait);
  }
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
  return { c, h };
}

export function monkPanel(w: number, h: number, save: SaveData, icons: IconSheet, a: MonkActions): Container {
  const view = new Container();
  view.addChild(backdrop(w, h));
  const rows = MONK_IDS.map((id) => row(save, id, icons, a));
  const boxH = 140 + rows.reduce((sum, r) => sum + r.h + ROW_GAP, 0) + 150;
  const box = new Container();
  box.position.set(w / 2, h / 2);
  // tall rows in a long language still leave the panel on screen
  box.scale.set(Math.min(1, (h - 80) / boxH));
  box.addChild(panel(W, boxH));
  const title = label(t('monk.title'), 64);
  title.y = -boxH / 2 + 75;
  box.addChild(title);
  let y = -boxH / 2 + 140 + ROW_GAP / 2;
  for (const r of rows) {
    r.c.y = y;
    box.addChild(r.c);
    y += r.h + ROW_GAP;
  }
  const back = button(t('common.back'), 400, 110, () => a.close(), { fill: COLORS.panelLocked });
  back.y = boxH / 2 - 85;
  box.addChild(back);
  view.addChild(box);
  return view;
}
