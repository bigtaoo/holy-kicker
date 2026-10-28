import { Container, Graphics } from 'pixi.js';
import { t } from '../i18n';
import type { SutraId } from '@hk/engine';
import { codexEntries, type CodexEntry, type EvolveId } from '../meta/codex';
import { evolvedIcon, iconSprite, lockedLook, type IconSheet } from './buildBar';
import { evolveDesc, sutraGoalText } from './cardText';
import { COLORS, fit, label, panel } from './widgets';

// The lobby's Codex tab: one cell per evolution and awakening, the item's icon with its paired
// passive on the corner. Recorded ones show their evolved name; the rest "???". Tapping a cell
// shows it below (beside the grid in a landscape lobby): what it does (or how to record it) and
// the recipe, which is never secret, so the Codex also teaches the pairs.

const GOLD = COLORS.gold;
const COLS = 3;
/** A landscape lobby's grid: four columns, with the detail beside it rather than under it. */
const WIDE_COLS = 4;
const DETAIL_W = 720;
const CELL_W = 310;
/** The cells' height when there is room; they shrink towards CELL_MIN so every row and the detail fit above the tab bar. */
const CELL_H = 184;
const CELL_MIN = 150;
const GAP = 16;
const ICON_R = 52;
const DETAIL_H = 320;
const HEAD_H = 110;

function itemName(e: CodexEntry): string {
  return e.relic ? t(`relic.${e.id as 'ball'}.name`) : t(`spell.${e.id as 'palm'}.name`);
}

/** Height under the grid: the detail panel in portrait, a margin beside it in landscape. */
function below(wide: boolean): number {
  return wide ? GAP : GAP * 2 + DETAIL_H;
}

/** The cells' height for `count` entries in a tab `room` tall. */
export function codexCellH(count: number, room: number, wide = false): number {
  const rows = Math.ceil(count / (wide ? WIDE_COLS : COLS));
  const fit = Math.floor((room - HEAD_H - (rows - 1) * GAP - below(wide)) / rows);
  return Math.max(CELL_MIN, Math.min(CELL_H, fit));
}

/** Total height of the tab's content with cells `cellH` tall. */
export function codexHeight(count: number, cellH = CELL_H, wide = false): number {
  const rows = Math.ceil(count / (wide ? WIDE_COLS : COLS));
  return HEAD_H + rows * cellH + (rows - 1) * GAP + below(wide);
}

/** Total width of the tab's content. */
export function codexWidth(wide = false): number {
  return wide ? WIDE_COLS * (CELL_W + GAP) + GAP + DETAIL_W : COLS * (CELL_W + GAP) - GAP;
}

/**
 * The tab centred on x = 0 from y = 0 down, at most `room` tall; `selected` is the entry shown
 * in detail, `sutras` the earned ones (a spell still behind its sutra shows how to earn it).
 */
export function codexTab(
  found: readonly EvolveId[], sutras: readonly SutraId[], icons: IconSheet, selected: EvolveId | null, select: (id: EvolveId) => void,
  room = Infinity, wide = false,
): Container {
  const c = new Container();
  const entries = codexEntries(found, sutras);
  const cellH = codexCellH(entries.length, room, wide);
  const cols = wide ? WIDE_COLS : COLS;
  const rows = Math.ceil(entries.length / cols);
  const gridH = rows * cellH + (rows - 1) * GAP;
  // landscape: the grid on the left, the detail on its right, both centred together on x = 0
  const gridX = wide ? -codexWidth(true) / 2 + (cols * (CELL_W + GAP) - GAP) / 2 : 0;
  const head = label(t('codex.title', { n: found.length, total: entries.length }), 64);
  head.y = HEAD_H / 2 - 10;
  c.addChild(head);
  entries.forEach((e, i) => {
    const cell = entryCell(e, icons, e.id === selected, cellH);
    const col = i % cols;
    const row = Math.floor(i / cols);
    // a last row with one entry centres it
    const inRow = Math.min(cols, entries.length - row * cols);
    cell.position.set(gridX + (col - (inRow - 1) / 2) * (CELL_W + GAP), HEAD_H + row * (cellH + GAP) + cellH / 2);
    cell.on('pointertap', () => select(e.id));
    c.addChild(cell);
  });
  const shown = entries.find((e) => e.id === selected) ?? null;
  const detail = wide ? detailPanel(shown, DETAIL_W, gridH) : detailPanel(shown, codexWidth(), DETAIL_H);
  if (wide) detail.position.set(codexWidth(true) / 2 - DETAIL_W / 2, HEAD_H + gridH / 2);
  else detail.y = codexHeight(entries.length, cellH) - DETAIL_H / 2;
  c.addChild(detail);
  return c;
}

function entryCell(e: CodexEntry, icons: IconSheet, selected: boolean, h: number): Container {
  const cell = new Container();
  cell.addChild(panel(CELL_W, h, e.found ? COLORS.panel : COLORS.panelLocked));
  if (selected) cell.addChild(new Graphics().roundRect(-CELL_W / 2 + 8, -h / 2 + 8, CELL_W - 16, h - 16, 22).stroke({ color: GOLD, width: 6 }));
  // the icon and the name keep their sizes; a shorter cell brings them closer together
  const squeeze = (CELL_H - h) / 2;
  const badge = new Container();
  badge.y = -30 + squeeze * 0.5;
  badge.addChild(new Graphics().circle(0, 0, ICON_R).fill(COLORS.panelLocked).stroke({ color: COLORS.outline, width: 8 })
    .circle(0, 0, ICON_R - 4).stroke({ color: e.found ? GOLD : COLORS.dim, width: e.found ? 6 : 4 }));
  const icon = evolvedIcon(icons, e.id, ICON_R * 1.6);
  if (icon) {
    if (!e.found) lockedLook(icon, true);
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
  name.y = 56 - squeeze * 0.6;
  cell.addChild(badge, name);
  cell.eventMode = 'static';
  cell.cursor = 'pointer';
  return cell;
}

/** The picked entry in a panel `w` x `h`: a wide one (portrait) keeps the recipe on one line, a tall one wraps it. */
function detailPanel(e: CodexEntry | null, w: number, h: number): Container {
  const c = new Container();
  c.addChild(panel(w, h));
  const tall = h > DETAIL_H;
  // a tall panel keeps its text clear of the corner marks
  const max = w - (tall ? 120 : 60);
  if (!e) {
    c.addChild(fit(label(t('codex.pick'), 48, COLORS.dim), max));
    return c;
  }
  const name = fit(label(e.found ? t(`evolve.${e.id}.name`) : t('codex.unknown'), 56, e.found ? GOLD : COLORS.dim), max);
  name.y = -h / 2 + 56;
  const wrap = { wordWrap: true, wordWrapWidth: max, breakWords: true, lineHeight: 56 };
  const recipeText = t('codex.recipe', { item: itemName(e), pair: t(`passive.${e.pair}.name`) });
  const recipe = tall ? label(recipeText, 48, COLORS.dim, wrap) : fit(label(recipeText, 48, COLORS.dim), max);
  recipe.y = h / 2 - (tall ? 50 : 22) - recipe.height / 2;
  // what it does fills the space between: two lines in portrait, more beside the grid; a longer text shrinks to fit
  const hint = e.sutra ? t('codex.sutra', { goal: sutraGoalText(e.sutra) }) : t('codex.hint');
  const what = label(e.found ? evolveDesc(e.id) : hint, 48, e.sutra ? GOLD : undefined, wrap);
  const room = tall ? h - 140 - recipe.height - 60 : 118;
  if (what.height > room) what.scale.set(room / what.height);
  what.y = tall ? (name.y + 40 + recipe.y - recipe.height / 2) / 2 : 4;
  c.addChild(name, what, recipe);
  return c;
}
