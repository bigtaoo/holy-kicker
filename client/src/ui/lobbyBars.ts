import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { seeTab, TABS, tabLock, tabNew, type Lock, type Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import { monkAffordable } from '../meta/monks';
import { iconSprite, lockIcon, type IconSheet } from './buildBar';
import { shopWaiting } from './lobbyEconomy';
import type { UiFrame } from './uiLayout';
import { COLORS, button, dot, fit, label, shade } from './widgets';

// The lobby's frame around its tabs: the painted courtyard behind everything, the top bar (the
// monk's portrait, name and level, the currencies, settings) and the bottom tab bar.

export const TOP_H = 150;
export const TAB_H = 190;
/** How far the bars reach past the frame, over the safe-area bands (more than any inset). */
const BLEED = 800;

/** The picture on each tab (ids in the icon sheet). */
const TAB_ICONS: Record<Tab, string> = { shop: 'shop', gear: 'robe', play: 'ball', train: 'train_attack', codex: 'codex' };

/** The painted temple courtyard, covering the frame between the bars, a little darkened. */
export function scenery(f: UiFrame, tex: Texture): Container {
  const c = new Container();
  const room = f.h - TOP_H - TAB_H;
  const pic = new Sprite(tex);
  pic.anchor.set(0.5, 1);
  pic.scale.set(Math.max(f.w / tex.width, room / tex.height));
  // the courtyard's floor meets the tab bar; a taller picture loses sky first
  pic.position.set(f.w / 2, f.h - TAB_H);
  const mask = new Graphics().rect(0, TOP_H, f.w, room).fill(0xffffff);
  pic.mask = mask;
  c.addChild(pic, mask, new Graphics().rect(0, TOP_H, f.w, room).fill({ color: 0x000000, alpha: 0.15 }));
  return c;
}

/** A bar's lacquer from y, h tall: the panel colour, with the outline and a gold trim line inside it at `edge`. */
function bar(w: number, y: number, h: number, edge: number, trimBelow: boolean): Graphics {
  return new Graphics().rect(0, y, w, h).fill(COLORS.panel)
    .rect(0, edge - 3, w, 6).fill(COLORS.outline)
    .rect(0, trimBelow ? edge + 3 : edge - 9, w, 6).fill(COLORS.trim);
}

export interface TopBarActions {
  monks(): void;
  settings(): void;
  /** Rolls a new dice name; null when a portal account names the player. */
  reroll: (() => void) | null;
}

/** Where the pips sit on each face of a die, in thirds of its half-width. */
const PIPS = [[[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];

/** A die showing `face` (1-6), the sign that the name next to it rolls again. */
function die(face: number): Graphics {
  const g = new Graphics().roundRect(-24, -24, 48, 48, 11).fill(0xfff7e6).stroke({ color: COLORS.outline, width: 5 });
  for (const [x, y] of PIPS[face - 1]) g.circle(x * 12, y * 12, 5).fill(COLORS.outline);
  g.rotation = -0.2;
  return g;
}

export function topBar(w: number, save: SaveData, shown: string, icons: IconSheet, a: TopBarActions): Container {
  const c = new Container();
  // the bar runs on into the safe-area band above the frame
  c.addChild(bar(w, -BLEED, TOP_H + BLEED, TOP_H - 3, false));
  // the avatar is the monk played as; it opens the monk panel
  const avatar = new Container();
  avatar.position.set(90, TOP_H / 2);
  avatar.addChild(new Graphics().circle(0, 0, 58).fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 6 }));
  // the portrait's head and shoulders, cut to the circle
  const face = iconSprite(icons, `monk_${save.monk}`, 230);
  if (face) {
    face.y = 62;
    const mask = new Graphics().circle(0, 0, 53).fill(0xffffff);
    face.mask = mask;
    avatar.addChild(face, mask);
  }
  if (monkAffordable(save)) avatar.addChild(dot(44, -44));
  avatar.eventMode = 'static';
  avatar.cursor = 'pointer';
  avatar.on('pointertap', a.monks);
  // the name and level roll a new name, the die next to it says so
  const who = new Container();
  const name = fit(label(shown, 44, COLORS.text, { align: 'left' }), 290);
  name.anchor.set(0, 0.5);
  name.position.set(160, TOP_H / 2 - 24);
  const level = label(t('lobby.level', { level: save.level }), 40, COLORS.dim);
  level.anchor.set(0, 0.5);
  level.position.set(160, TOP_H / 2 + 26);
  who.addChild(name, level);
  if (a.reroll) {
    const d = die(1 + (save.dice % 6));
    d.position.set(name.x + name.width + 36, name.y);
    who.addChild(d);
    who.hitArea = { contains: (x: number, y: number) => x >= 150 && x <= 520 && y >= 0 && y <= TOP_H };
    who.eventMode = 'static';
    who.cursor = 'pointer';
    who.on('pointertap', a.reroll);
  }
  c.addChild(avatar, who);

  const icon = iconSprite(icons, 'settings', 64);
  const gear = button(icon ? '' : '⚙', 100, 100, a.settings, { fill: COLORS.panelLocked, size: 56, icon });
  gear.position.set(w - 80, TOP_H / 2 - 4);
  c.addChild(gear);
  // the currencies right-aligned, left of the settings button: a dark pill with the coin over its left end
  let x = w - 160;
  for (const [amount, id, color] of [[save.jade, 'jade', COLORS.jade], [save.copper, 'copper', COLORS.copper]] as const) {
    const text = label(formatAmount(amount), 46);
    text.anchor.set(1, 0.5);
    text.position.set(x - 18, TOP_H / 2);
    const left = x - text.width - 70;
    const pill = new Graphics().roundRect(left, TOP_H / 2 - 30, x - left, 60, 30).fill(shade(COLORS.outline, 0.08)).stroke({ color: shade(COLORS.panel, 0.2), width: 3 });
    const coin = iconSprite(icons, id, 76) ?? new Graphics().circle(0, 0, 24).fill(color).stroke({ color: COLORS.outline, width: 5 });
    coin.position.set(left + 8, TOP_H / 2);
    c.addChild(pill, coin, text);
    x = left - 40;
  }
  return c;
}

export interface TabBarActions {
  select(tab: Tab, save: SaveData): void;
  locked(lock: Lock): void;
}

/** The five tabs along the bottom: picture over name, the open one raised in saffron. */
export function tabBar(w: number, h: number, save: SaveData, current: Tab, icons: IconSheet, a: TabBarActions): Container {
  const c = new Container();
  const tw = w / TABS.length;
  c.addChild(bar(w, h - TAB_H, TAB_H + BLEED, h - TAB_H + 3, true));
  TABS.forEach((tab, i) => {
    const lock = tabLock(save, tab);
    const active = tab === current;
    const cell = new Container();
    cell.position.set(tw * (i + 0.5), h - TAB_H / 2 + 4);
    if (active) {
      cell.addChild(new Graphics()
        .roundRect(-tw / 2 + 8, -TAB_H / 2 + 6, tw - 16, TAB_H - 20, 26).fill(shade(COLORS.saffron, -0.35)).stroke({ color: COLORS.outline, width: 6 })
        .roundRect(-tw / 2 + 12, -TAB_H / 2 + 10, tw - 24, TAB_H - 40, 22).fill(COLORS.saffron));
    }
    const pic = iconSprite(icons, TAB_ICONS[tab], active ? 100 : 86);
    if (pic) {
      pic.y = active ? -30 : -22;
      if (lock) pic.alpha = 0.3;
      cell.addChild(pic);
    }
    const name = fit(label(t(`tab.${tab}` as never), 40, active ? COLORS.outline : lock ? COLORS.dim : COLORS.text, {
      stroke: active ? undefined : { color: COLORS.outline, width: 6 },
    }), tw - 24);
    name.y = active ? 48 : 56;
    cell.addChild(name);
    if (lock) {
      const l = lockIcon(icons, 52);
      l.position.set(tw / 2 - 40, -TAB_H / 2 + 44);
      cell.addChild(l);
    } else if (tabNew(save, tab) || (tab === 'shop' && shopWaiting(save, Date.now()))) {
      cell.addChild(dot(tw / 2 - 30, -TAB_H / 2 + 30));
    }
    cell.eventMode = 'static';
    cell.cursor = 'pointer';
    cell.on('pointertap', () => {
      if (lock) return a.locked(lock);
      a.select(tab, tabNew(save, tab) ? seeTab(save, tab) : save);
    });
    c.addChild(cell);
  });
  return c;
}
