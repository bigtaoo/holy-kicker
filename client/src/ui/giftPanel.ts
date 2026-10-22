import { Container, Graphics } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { Haul } from '../meta/haul';
import type { SaveData } from '../meta/save';
import { giftHaul, giftReady } from '../meta/welcome';
import { iconSprite, type IconSheet } from './buildBar';
import { gearTiles } from './gearTiles';
import { COLORS, backdrop, button, dot, fit, label, panel } from './widgets';

// The welcome calendar (meta/welcome.ts): a week of gifts in seven cells, the last one (a monk)
// twice as wide. Claimed ones carry a tick, today's is lit, the rest wait; a missed day only
// moves the next gift to the next visit, which the note under the cells says. Builder only: the
// claiming lives in lobbyEconomy.ts.

export interface GiftPanelActions {
  claim(): void;
  close(): void;
}

const BOX_W = 960;
const CELL_W = 215;
const CELL_H = 330;
const GAP = 14;
const PER_ROW = 4;
const BOX_H = 1380;

export function giftPanel(save: SaveData, now: number, w: number, h: number, icons: IconSheet, a: GiftPanelActions): Container {
  const root = new Container();
  root.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const top = -BOX_H / 2;
  box.addChild(panel(BOX_W, BOX_H));
  const title = fit(label(t('gift.title'), 64, COLORS.saffron), BOX_W - 80);
  title.y = top + 80;
  box.addChild(title);
  const ready = giftReady(save, now);
  const gifts = BALANCE.welcome;
  const rowW = PER_ROW * CELL_W + (PER_ROW - 1) * GAP;
  gifts.forEach((gift, i) => {
    const last = i === gifts.length - 1 && i % PER_ROW !== PER_ROW - 1;
    // the last one fills what is left of its row
    const span = last ? PER_ROW - (i % PER_ROW) : 1;
    const cw = span * CELL_W + (span - 1) * GAP;
    const state = i < save.gifts ? 'claimed' : i === save.gifts && ready ? 'ready' : 'later';
    const c = cell(i + 1, giftHaul(save, gift), state, cw, icons);
    c.position.set(-rowW / 2 + (i % PER_ROW) * (CELL_W + GAP) + cw / 2, top + 170 + Math.floor(i / PER_ROW) * (CELL_H + GAP) + CELL_H / 2);
    box.addChild(c);
  });
  const rows = Math.ceil(gifts.length / PER_ROW);
  const note = label(t('gift.note'), 48, COLORS.dim, { wordWrap: true, wordWrapWidth: BOX_W - 100, breakWords: true });
  note.y = top + 170 + rows * (CELL_H + GAP) + 20 + note.height / 2;
  box.addChild(note);
  const claim = button(ready ? t('gift.claimNow') : t('gift.later'), 520, 130, () => ready && a.claim(), {
    fill: ready ? COLORS.saffron : COLORS.panelLocked, textFill: ready ? COLORS.text : COLORS.dim, size: 52,
  });
  claim.y = top + BOX_H - 280;
  const back = button(t('common.back'), 400, 110, a.close, { fill: COLORS.panelLocked });
  back.y = top + BOX_H - 110;
  box.addChild(claim, back);
  root.addChild(box);
  return root;
}

/** One day: its number, what it pays (a monk's portrait, else the gear tile, and the coins), and its state. */
function cell(day: number, haul: Haul, state: 'claimed' | 'ready' | 'later', cw: number, icons: IconSheet): Container {
  const c = new Container();
  const lit = state === 'ready';
  c.addChild(panel(cw, CELL_H, lit ? 0x6a4a14 : state === 'claimed' ? COLORS.panelLocked : COLORS.panel, 22));
  if (lit) c.addChild(new Graphics().roundRect(-cw / 2, -CELL_H / 2, cw, CELL_H, 22).stroke({ color: COLORS.gold, width: 8 }));
  const name = fit(label(t('gift.day', { n: day }), 48, lit ? COLORS.gold : COLORS.text), cw - 30);
  name.y = -CELL_H / 2 + 42;
  c.addChild(name);
  const coins = [
    ...(haul.jade > 0 ? [['jade', haul.jade, COLORS.jade] as const] : []),
    ...(haul.copper > 0 ? [['copper', haul.copper, COLORS.copper] as const] : []),
  ];
  const art = haul.monk ? iconSprite(icons, `monk_${haul.monk}`, 170)
    : haul.drops[0] ? gearTiles(haul.drops, icons)[0]! : null;
  if (art) {
    art.y = coins.length > 0 ? -10 : 20;
    c.addChild(art);
  }
  if (haul.monk) {
    const l = fit(label(t(`monk.${haul.monk}.name`), 48, COLORS.gold), cw - 30);
    l.y = CELL_H / 2 - 50;
    c.addChild(l);
  }
  coins.forEach(([coin, n, fill], k) => {
    const line = new Container();
    const l = label(`+${formatAmount(n)}`, 48, fill);
    const icon = iconSprite(icons, coin, 50);
    if (icon) {
      icon.x = -l.width / 2 - 4;
      l.x = icon.width / 2 + 4;
      line.addChild(icon);
    }
    line.addChild(l);
    line.y = CELL_H / 2 - 50 - (coins.length - 1 - k) * 58;
    c.addChild(line);
  });
  if (state === 'claimed') {
    c.alpha = 0.75;
    c.addChild(new Graphics()
      .moveTo(-36, 0).lineTo(-10, 28).lineTo(40, -30)
      .stroke({ color: COLORS.outline, width: 26, cap: 'round', join: 'round' })
      .moveTo(-36, 0).lineTo(-10, 28).lineTo(40, -30)
      .stroke({ color: COLORS.jade, width: 14, cap: 'round', join: 'round' }));
  }
  if (lit) c.addChild(dot(cw / 2 - 16, -CELL_H / 2 + 16));
  return c;
}
