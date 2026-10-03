import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import { codexEntries, type CodexEntry, type EvolveId } from '../meta/codex';
import { iconSprite, type IconSheet } from './buildBar';
import { evolveDesc } from './cardText';
import { COLORS, fit, label, panel } from './widgets';

// The lobby's Codex tab: one cell per evolution and awakening, the item's icon with its paired
// passive on the corner. Recorded ones show their evolved name; the rest "???". Tapping a cell
// shows it below: what it does (or how to record it) and the recipe, which is never secret,
// so the Codex also teaches the pairs.

const GOLD = 0xffd860;
const COLS = 2;
const CELL_W = 470;
// short cells: ten entries (five rows) and the detail fit between the header and the tab bar
const CELL_H = 184;
const GAP = 16;
const ICON_R = 52;
const DETAIL_H = 280;
const HEAD_H = 110;

function itemName(e: CodexEntry): string {
  return e.relic ? t(`relic.${e.id as 'ball'}.name`) : t(`spell.${e.id as 'palm'}.name`);
}

/** Total height of the tab's content, so the lobby can centre it. */
export function codexHeight(count: number): number {
  const rows = Math.ceil(count / COLS);
  return HEAD_H + rows * CELL_H + (rows - 1) * GAP + GAP * 2 + DETAIL_H;
}

/** The tab centred on x = 0 from y = 0 down; `selected` is the entry shown in detail. */
export function codexTab(found: readonly EvolveId[], icons: IconSheet, selected: EvolveId | null, select: (id: EvolveId) => void): Container {
  const c = new Container();
  const entries = codexEntries(found);
  const head = label(t('codex.title', { n: found.length, total: entries.length }), 64);
  head.y = HEAD_H / 2 - 10;
  c.addChild(head);
  entries.forEach((e, i) => {
    const cell = entryCell(e, icons, e.id === selected);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    // a last row with one entry centres it
    const inRow = Math.min(COLS, entries.length - row * COLS);
    cell.position.set((col - (inRow - 1) / 2) * (CELL_W + GAP), HEAD_H + row * (CELL_H + GAP) + CELL_H / 2);
    cell.on('pointertap', () => select(e.id));
    c.addChild(cell);
  });
  const detail = detailPanel(entries.find((e) => e.id === selected) ?? null);
  detail.y = codexHeight(entries.length) - DETAIL_H / 2;
  c.addChild(detail);
  return c;
}

function entryCell(e: CodexEntry, icons: IconSheet, selected: boolean): Container {
  const cell = new Container();
  cell.addChild(panel(CELL_W, CELL_H, e.found ? COLORS.panel : COLORS.panelLocked));
  if (selected) cell.addChild(new Graphics().roundRect(-CELL_W / 2 + 8, -CELL_H / 2 + 8, CELL_W - 16, CELL_H - 16, 22).stroke({ color: GOLD, width: 6 }));
  const badge = new Container();
  badge.y = -30;
  badge.addChild(new Graphics().circle(0, 0, ICON_R).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 8 })
    .circle(0, 0, ICON_R - 4).stroke({ color: e.found ? GOLD : COLORS.dim, width: e.found ? 6 : 4 }));
  const icon = iconSprite(icons, e.id, ICON_R * 1.6);
  if (icon) {
    if (!e.found) icon.alpha = 0.35;
    badge.addChild(icon);
  }
  // the paired passive, small on the lower right like the HUD's hint
  const r = ICON_R * 0.55;
  const pair = new Container();
  pair.position.set(ICON_R * 0.85, ICON_R * 0.5);
  pair.addChild(new Graphics().circle(0, 0, r).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 5 }));
  const small = iconSprite(icons, e.pair, r * 1.5);
  if (small) pair.addChild(small);
  badge.addChild(pair);
  const name = fit(label(e.found ? t(`evolve.${e.id}.name`) : t('codex.unknown'), 48, e.found ? GOLD : COLORS.dim), CELL_W - 40);
  name.y = 56;
  cell.addChild(badge, name);
  cell.eventMode = 'static';
  cell.cursor = 'pointer';
  return cell;
}

function detailPanel(e: CodexEntry | null): Container {
  const c = new Container();
  c.addChild(panel(CELL_W * COLS + GAP, DETAIL_H));
  const max = CELL_W * COLS - 40;
  if (!e) {
    c.addChild(label(t('codex.pick'), 48, COLORS.dim));
    return c;
  }
  const name = fit(label(e.found ? t(`evolve.${e.id}.name`) : t('codex.unknown'), 56, e.found ? GOLD : COLORS.dim), max);
  name.y = -82;
  const what = fit(label(e.found ? evolveDesc(e.id) : t('codex.hint'), 48), max);
  what.y = 0;
  const recipe = fit(label(t('codex.recipe', { item: itemName(e), pair: t(`passive.${e.pair}.name`) }), 48, COLORS.dim), max);
  recipe.y = 82;
  c.addChild(name, what, recipe);
  return c;
}
