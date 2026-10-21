import { Container, Graphics } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { canMerge, gearStats, itemStats, mergeCost, TIERS, worn, type GearSlot, type ItemId, type Tier } from '../meta/gear';
import type { SaveData } from '../meta/save';
import { lockedLook, type IconSheet } from './buildBar';
import { gearIcon } from './gearIcons';
import { itemName, TIER_COLORS, tierName } from './gearText';
import { statLines } from './statText';
import { DOLL_H, gearDoll, HERO_FEET, HERO_H } from './gearDoll';
import { CARD, CARD_STROKE } from './playCard';
import { COLORS, backdrop, button, fit, label, panel, shade } from './widgets';

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
/** The stats card's rows: a little tighter than the dark panel's, the card sits under the doll. */
const ROW_H = 58;
const MERGE_W = 440;
const MERGE_H = 110;

function cardHeight(lines: number): number {
  return 100 + Math.max(1, Math.ceil(lines / 2)) * ROW_H + 36;
}

/** Total height of the tab's content, its top at y = 0. */
export function gearHeight(save: SaveData): number {
  return DOLL_H + 20 + cardHeight(statLines(gearStats(save)).length);
}

/** Whether any merge can go ahead now. */
function anyMerge(save: SaveData): boolean {
  return Object.keys(save.gear).some((item) => [0, 1, 2, 3].some((tier) => canMerge(save, item as ItemId, tier as Tier)));
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

/**
 * The tab centred on x = 0 from y = 0 down: the doll with the hero `hero` makes (the lobby's
 * figure, as tall as asked, feet at its origin) in the middle, "Merge all" at his feet when anything can merge (a
 * quiet line saying how merging works when nothing can) and the light card of what gear adds up to.
 */
export function gearTab(save: SaveData, icons: IconSheet, actions: GearActions, hero?: (height: number) => Container): Container {
  const c = new Container();
  c.addChild(gearDoll(save, icons, worn(save), hero?.(HERO_H) ?? null, (slot) => actions.open(slot)));
  const feet = HERO_FEET + 30 + MERGE_H / 2;
  if (anyMerge(save)) {
    const all = button(t('gear.mergeAll'), MERGE_W, MERGE_H, () => actions.mergeAll(), { size: 52, textFill: COLORS.outline });
    all.y = feet;
    c.addChild(all);
  } else {
    const how = label(t('gear.howMerge'), 40, COLORS.text, { ...CARD_STROKE, wordWrap: true, wordWrapWidth: MERGE_W, breakWords: true, lineHeight: 46 });
    how.alpha = 0.8;
    how.y = feet;
    c.addChild(how);
  }
  const lines = statLines(gearStats(save));
  const h = cardHeight(lines.length);
  const card = statsCard(t('gear.total'), lines, h);
  card.y = DOLL_H + 20 + h / 2;
  c.addChild(card);
  return c;
}

/** What the worn gear adds up to: the Play tab's light card, its lines in two columns. */
function statsCard(title: string, lines: string[], h: number): Container {
  const c = new Container();
  c.addChild(panel(STATS_W, h, CARD.fill));
  const head = label(title, 52, COLORS.text, CARD_STROKE);
  head.y = -h / 2 + 56;
  c.addChild(head);
  if (lines.length === 0) lines = ['—'];
  const colW = (STATS_W - 80) / 2;
  lines.forEach((text, i) => {
    const l = fit(label(text, 48, shade(CARD.quiet, -0.35)), colW - 20);
    const one = lines.length === 1;
    l.position.set(one ? 0 : (i % 2 - 0.5) * colW, -h / 2 + 100 + Math.floor(i / 2) * ROW_H + ROW_H / 2);
    c.addChild(l);
  });
  return c;
}

/** A titled panel with stat lines in two columns. */
export function statsPanel(title: string, lines: string[], h: number, w = STATS_W): Container {
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
    l.position.set(one ? 0 : (i % 2 - 0.5) * colW, -h / 2 + 110 + Math.floor(i / 2) * LINE_H + LINE_H / 2);
    c.addChild(l);
  });
  return c;
}

/** The item of a slot, full screen: stats now and next, one row per tier with its merge. */
export function gearDetail(save: SaveData, slot: GearSlot, icons: IconSheet, w: number, h: number, actions: GearActions): Container {
  const root = new Container();
  root.addChild(backdrop(w, h));
  const { item, tier } = worn(save).find((s) => s.slot === slot)!;
  const boxW = 980;
  const boxH = 1500;
  const box = new Container();
  box.position.set(w / 2, h / 2);
  box.addChild(panel(boxW, boxH));
  root.addChild(box);
  let y = -boxH / 2 + 80;
  const title = fit(label(itemName(item), 64), boxW - 80);
  title.y = y;
  const b = badge(icons, item, tier, 100);
  b.y = y + 170;
  box.addChild(title, b);
  y += 300;

  const colW = (boxW - 60) / 2;
  const column = (x: number, head: string, fill: number, lines: string[]) => {
    const hd = fit(label(head, 48, fill), colW - 20);
    hd.position.set(x, y);
    box.addChild(hd);
    lines.forEach((text, i) => {
      const l = fit(label(text, 48, fill === COLORS.dim ? COLORS.dim : COLORS.text), colW - 20);
      l.position.set(x, y + 70 + i * 60);
      box.addChild(l);
    });
  };
  const now = tier !== -1 ? statLines(itemStats(item, tier)) : [];
  column(-colW / 2, tier !== -1 ? t('gear.worn', { tier: tierName(tier) }) : t('gear.none'), tier >= 0 ? TIER_COLORS[tier] : COLORS.dim, now);
  if (tier < TIERS - 1) {
    const next = (tier + 1) as Tier;
    column(colW / 2, `${t('gear.next')}: ${tierName(next)}`, COLORS.dim, statLines(itemStats(item, next)));
  }
  y += 70 + 4 * 60 + 30;

  for (let k = 0 as Tier; k < TIERS; k = (k + 1) as Tier) {
    const row = tierRow(save, item, k, boxW - 80, actions);
    row.y = y + 55;
    box.addChild(row);
    y += 118;
  }
  const back = button(t('common.back'), 400, 120, () => actions.close(), { fill: COLORS.panelLocked });
  back.y = boxH / 2 - 100;
  box.addChild(back);
  return root;
}

function tierRow(save: SaveData, item: ItemId, tier: Tier, w: number, actions: GearActions): Container {
  const row = new Container();
  const count = save.gear[item][tier];
  row.addChild(new Graphics().roundRect(-w / 2, -50, w, 100, 20).fill(count > 0 ? COLORS.panel : COLORS.panelLocked)
    .stroke({ color: TIER_COLORS[tier], width: 5 }));
  const name = fit(label(tierName(tier), 48, TIER_COLORS[tier]), 230);
  name.anchor.set(0, 0.5);
  name.x = -w / 2 + 30;
  const n = label(`${count}/${BALANCE.gear.mergeCount}`, 48, count > 0 ? COLORS.text : COLORS.dim);
  n.x = -w / 2 + 330;
  row.addChild(name, n);
  if (tier < TIERS - 1) {
    const enough = count >= BALANCE.gear.mergeCount;
    const ok = canMerge(save, item, tier);
    const cost = mergeCost(tier);
    const text = `${t('gear.merge', { tier: tierName((tier + 1) as Tier) })}  ${formatAmount(cost)}`;
    const m = button(text, 480, 84, () => {
      if (ok) actions.merge(item, tier);
      else if (enough) actions.toast(t('gear.noCopper'));
    }, { fill: ok ? COLORS.saffron : COLORS.panelLocked, textFill: ok ? COLORS.outline : COLORS.dim, size: 48 });
    m.x = w / 2 - 250;
    row.addChild(m);
  }
  return row;
}

