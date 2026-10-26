import { Container, Graphics } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { canMerge, gearStats, itemStats, mergeCost, TIERS, worn, type GearSlot, type ItemId, type Tier } from '../meta/gear';
import type { SaveData } from '../meta/save';
import { lockedLook, type IconSheet } from './buildBar';
import { gearIcon } from './gearIcons';
import { itemName, mergeReady, TIER_COLORS, tierName } from './gearText';
import { statLines } from './statText';
import { DOLL_H, gearDoll, HERO_FEET } from './gearDoll';
import { CARD_STROKE } from './playCard';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The lobby's Gear tab (docs/design.md "Meta progression", "Lobby layout"): the six worn slots
// around the hero (gearDoll.ts), "Merge all" and what they add up to; tapping a slot opens its item, with its stats now and at the next
// tier and one merge row per tier. The best tier owned is worn, so there is nothing to equip.

export interface GearActions {
  open(slot: GearSlot): void;
  close(): void;
  merge(item: ItemId, tier: Tier): void;
  mergeAll(): void;
  /** A short message over the tab bar (why a button does nothing). */
  toast(text: string): void;
}

const LINE_H = 62;
const STATS_W = 1000;
/** A landscape frame's stats card: one column beside the doll's left slots, whose wide labels end 552 from the middle. */
const SIDE_STATS_W = 640;
const SIDE_STATS_X = -(552 + 36 + SIDE_STATS_W / 2);
/** The stats card's rows: a little tighter than the dark panel's, the card sits under the doll. */
const ROW_H = 58;
const MERGE_W = 440;
const MERGE_H = 110;
/** The doll's least gap under the stats panel, and how far its bottom stays above the tab bar. */
const DOLL_GAP = 30;
const DOLL_FLOOR = 30;
/** The item panel's tier rows: one per tier, eight of them, so they stay compact. */
const TIER_ROW_H = 84;
const TIER_STEP = 96;
const MERGE_BTN_W = 380;

/** Whether any merge can go ahead now. */
function anyMerge(save: SaveData): boolean {
  return (Object.keys(save.gear) as ItemId[]).some((item) => mergeReady(save, item));
}

/**
 * Stat lines in two columns from `top` down, row by row; a line far too long for its column wraps
 * onto a second line (and its row grows) instead of being squeezed. Returns the grid's height.
 */
function statGrid(into: Container, cols: [number, string[], number][], colW: number, rowH: number, top: number): number {
  const rows = Math.max(...cols.map(([, lines]) => lines.length));
  let y = top;
  for (let i = 0; i < rows; i++) {
    const cells = cols.filter(([, lines]) => lines[i] !== undefined).map(([x, lines, fill]) => {
      // a little too long squeezes as everywhere else; much too long (invincibility) wraps
      const one = label(lines[i], 48, fill);
      const l = one.width * 0.8 <= colW - 20 ? fit(one, colW - 20)
        : label(lines[i], 48, fill, { wordWrap: true, wordWrapWidth: colW - 20, breakWords: true, lineHeight: 52 });
      if (l !== one) one.destroy();
      l.x = x;
      return l;
    });
    const h = Math.max(rowH, ...cells.map((l) => l.height + 6));
    for (const l of cells) {
      l.y = y + h / 2;
      into.addChild(l);
    }
    y += h;
  }
  return y - top;
}

function badge(icons: IconSheet, item: ItemId, tier: Tier | -1, r: number): Container {
  const c = new Container();
  const rim = tier >= 0 ? TIER_COLORS[tier] : COLORS.dim;
  c.addChild(new Graphics().circle(0, 0, r).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 8 })
    .circle(0, 0, r - 6).stroke({ color: rim, width: tier >= 0 ? 8 : 4 }));
  const icon = gearIcon(icons, item, r * 1.45);
  if (icon) {
    if (tier < 0) lockedLook(icon, true);
    c.addChild(icon);
  }
  return c;
}

/** Where the lobby's figure stands, from the tab's top: `hero` (feet at its origin) at `feet`, the tab's button centred at `button`. */
export interface GearStand {
  hero: Container;
  feet: number;
  button: number;
}

/**
 * The tab centred on x = 0 from y = 0 down to `room`: the panel of what gear adds up to on top,
 * the doll under it with the hero where `stand` puts him (the Play tab's figure, same place and
 * size, so he holds still between the tabs), and "Merge all" where PLAY stands when anything can
 * merge (a quiet line saying how merging works when nothing can). Without `stand` the doll rests
 * on the tab's floor. A landscape frame (`side`) is too short for the panel over the doll: it
 * stands in one column to the doll's left, the doll from the tab's top.
 */
export function gearTab(save: SaveData, icons: IconSheet, actions: GearActions, room: number, stand?: GearStand, side = false): Container {
  const c = new Container();
  const [card, h] = statsCard(t('gear.total'), statLines(gearStats(save)), side ? SIDE_STATS_W : STATS_W);
  card.position.set(side ? SIDE_STATS_X : 0, h / 2);
  const feet = stand?.feet ?? room - DOLL_FLOOR - DOLL_H + HERO_FEET;
  const doll = gearDoll(save, icons, worn(save), (slot) => actions.open(slot), side);
  // the lowest badges level with his feet, unless a long stats panel pushes them lower (or the tab is too short for
  // that); beside the card, names on one line leave the doll shorter than DOLL_H, so it is measured
  const dollH = side ? doll.getLocalBounds().maxY : DOLL_H;
  doll.y = side ? Math.max(0, Math.min(feet - HERO_FEET, room - dollH)) : Math.max(h + DOLL_GAP, feet - HERO_FEET);
  c.addChild(doll);
  if (stand) {
    stand.hero.y = feet;
    c.addChild(stand.hero);
  }
  const at = stand?.button ?? Math.min(room - MERGE_H / 2, feet + 30 + MERGE_H / 2);
  if (anyMerge(save)) {
    const all = button(t('gear.mergeAll'), MERGE_W, MERGE_H, () => actions.mergeAll(), { size: 52, textFill: COLORS.outline });
    all.y = at;
    c.addChild(all);
  } else {
    const how = label(t('gear.howMerge').replace(/(\d) /g, '$1 '), 48, COLORS.text, { ...CARD_STROKE, wordWrap: true, wordWrapWidth: MERGE_W, breakWords: true, lineHeight: 54 });
    how.alpha = 0.8;
    how.y = at;
    c.addChild(how);
  }
  c.addChild(card);
  return c;
}

/** What the worn gear adds up to: a dark panel like the other tabs', its lines in two columns (one on a narrow card). */
function statsCard(title: string, lines: string[], w: number): [Container, number] {
  const c = new Container();
  const body = new Container();
  const head = label(title, 52, COLORS.saffron);
  head.y = 56;
  if (lines.length === 0) lines = ['—'];
  const one = lines.length === 1 || w < STATS_W;
  const colW = one ? w - 80 : (w - 80) / 2;
  const fill = COLORS.text;
  const left = lines.filter((_, i) => one || i % 2 === 0);
  const right = one ? [] : lines.filter((_, i) => i % 2 === 1);
  const h = 100 + statGrid(body, [[one ? 0 : -colW / 2, left, fill], [colW / 2, right, fill]], colW, ROW_H, 100) + 36;
  body.addChild(head);
  body.y = -h / 2;
  c.addChild(panel(w, h), body);
  return [c, h];
}

/** A titled panel with stat lines in two columns, `lineH` apart (a panel stretched taller spreads them). */
export function statsPanel(title: string, lines: string[], h: number, w = STATS_W, lineH = LINE_H): Container {
  const c = new Container();
  c.addChild(panel(w, h));
  const head = label(title, 52, COLORS.saffron);
  head.y = -h / 2 + 60;
  c.addChild(head);
  if (lines.length === 0) lines = ['—'];
  const colW = (w - 80) / 2;
  lines.forEach((text, i) => {
    const l = fit(label(text, 48), colW - 20);
    const one = lines.length === 1;
    l.position.set(one ? 0 : (i % 2 - 0.5) * colW, -h / 2 + 110 + Math.floor(i / 2) * lineH + lineH / 2);
    c.addChild(l);
  });
  return c;
}

/**
 * The item of a slot, full screen: its badge, its stats now and at the next tier side by side,
 * one row per tier with its count and merge, and Back under them; the panel is as tall as that.
 */
export function gearDetail(save: SaveData, slot: GearSlot, icons: IconSheet, w: number, h: number, actions: GearActions): Container {
  const root = new Container();
  root.addChild(backdrop(w, h));
  const { item, tier } = worn(save).find((s) => s.slot === slot)!;
  const boxW = 980;
  const body = new Container();
  let y = 75;
  const title = fit(label(itemName(item), 64), boxW - 80);
  title.y = y;
  const b = badge(icons, item, tier, 76);
  b.y = y + 130;
  body.addChild(title, b);
  y += 250;

  const colW = (boxW - 60) / 2;
  const nextTier = tier < TIERS - 1 ? ((tier + 1) as Tier) : null;
  const heads: [number, string, number][] = [
    [-colW / 2, tier !== -1 ? t('gear.worn', { tier: tierName(tier) }) : t('gear.none'), tier >= 0 ? TIER_COLORS[tier] : COLORS.dim],
  ];
  if (nextTier !== null) heads.push([colW / 2, `${t('gear.next')}: ${tierName(nextTier)}`, COLORS.dim]);
  for (const [x, text, fill] of heads) {
    const hd = fit(label(text, 48, fill), colW - 20);
    hd.position.set(x, y);
    body.addChild(hd);
  }
  y += 40;
  const now = tier !== -1 ? statLines(itemStats(item, tier)) : [];
  const next = nextTier !== null ? statLines(itemStats(item, nextTier)) : [];
  y += statGrid(body, [[-colW / 2, now, COLORS.text], [colW / 2, next, COLORS.dim]], colW, 58, y) + 36;

  for (let k = 0 as Tier; k < TIERS; k = (k + 1) as Tier) {
    const row = tierRow(save, item, k, boxW - 80, actions);
    row.y = y + TIER_ROW_H / 2;
    body.addChild(row);
    y += TIER_STEP;
  }
  const back = button(t('common.back'), 400, 110, () => actions.close(), { fill: COLORS.panelLocked });
  back.y = y + 20 + 55;
  body.addChild(back);
  const boxH = y + 20 + 110 + 45;
  const box = new Container();
  // a short screen scales the panel down rather than pushing Back under the edge
  box.scale.set(Math.min(1, (h - 40) / boxH, (w - 40) / boxW));
  box.position.set(w / 2, h / 2);
  body.y = -boxH / 2;
  box.addChild(panel(boxW, boxH), body);
  root.addChild(box);
  return root;
}

/** A tier's row: its name and count on the left, the merge into the next tier and its copper on the right. */
function tierRow(save: SaveData, item: ItemId, tier: Tier, w: number, actions: GearActions): Container {
  const row = new Container();
  const count = save.gear[item][tier];
  const rh = TIER_ROW_H;
  row.addChild(new Graphics().roundRect(-w / 2, -rh / 2, w, rh, 20).fill(count > 0 ? COLORS.panel : COLORS.panelLocked)
    .stroke({ color: TIER_COLORS[tier], width: 5 }));
  const name = fit(label(tierName(tier), 48, TIER_COLORS[tier]), 240);
  name.anchor.set(0, 0.5);
  name.x = -w / 2 + 30;
  const n = label(`${count}/${BALANCE.gear.mergeCount}`, 48, count > 0 ? COLORS.text : COLORS.dim);
  n.x = -w / 2 + 350;
  row.addChild(name, n);
  if (tier < TIERS - 1) {
    const enough = count >= BALANCE.gear.mergeCount;
    const ok = canMerge(save, item, tier);
    const text = `${t('gear.merge')}  ${formatAmount(mergeCost(tier))}`;
    const m = button(text, MERGE_BTN_W, rh - 12, () => {
      if (ok) actions.merge(item, tier);
      else if (enough) actions.toast(t('gear.noCopper'));
    }, { fill: ok ? COLORS.saffron : COLORS.panelLocked, textFill: ok ? COLORS.outline : COLORS.dim, size: 48 });
    m.x = w / 2 - MERGE_BTN_W / 2 - 10;
    row.addChild(m);
  }
  return row;
}
