import { Container, Graphics } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { SaveData } from '../meta/save';
import { nextNode, trainBlock, trainingStats, trainNode, type TrainStat } from '../meta/training';
import { iconSprite, lockedLook, type IconSheet } from './buildBar';
import { statsPanel } from './gearTab';
import { BADGE } from './playCard';
import { statLines, statText } from './statText';
import { boardPage, boardPos, boardRows, BOARD_ROW, pageCount, pageRange, ringPulse } from './trainBoard';
import { COLORS, button, fit, label, panel } from './widgets';

// The lobby's Train tab (docs/design.md "Training", "Lobby layout"): the whole line on its own
// dark board as a path of nodes in three plain states (trained: full colour on a lit badge;
// next: a bigger lit badge in a breathing saffron ring; the rest: grey silhouettes on dark
// discs), the picked node's card with the Train button, and what the trained nodes add up to
// (only once there is something). Tapping a node shows what it gives and the level that opens it.
// The line comes in pages of valueStep nodes, with tabs on the board's title band; the pages after
// the first wear a gold ×2 (×3, ...) on their tab and their nodes' card: each node there adds that much more.

export interface TrainActions {
  train(): void;
  /** Shows node `n` in the card (null: the next one). */
  pick(n: number | null): void;
  toast(text: string): void;
}

const W = 1040;
/** The board's title band over its first row. */
const HEAD = 110;
const BOARD_PAD = 34;
const NODE_R = 40;
const NEXT_R = 48;
const GAP = 30;
const CARD_H = 380;
const LINE_H = 62;
/** The road between future nodes, and the board's dark discs. */
const ROAD = 0x46524b;
const SLOT = 0x1c2320;

/** One colour per stat, so the line reads as a pattern. */
const STAT_COLOR: Partial<Record<TrainStat, number>> = {
  attack: 0xf07040, maxHp: COLORS.danger, xp: COLORS.trim, copper: COLORS.copper, magnet: COLORS.jade, revive: COLORS.gold,
};

/** Each stat's painted icon on the icon sheet (art/monk/icons/train_*). */
const STAT_ICON: Partial<Record<TrainStat, string>> = {
  attack: 'train_attack', maxHp: 'train_hp', xp: 'train_xp', copper: 'train_copper', magnet: 'train_magnet', revive: 'train_revive',
};

function statIcon(icons: IconSheet, stat: TrainStat, size: number) {
  const id = STAT_ICON[stat];
  return id ? iconSprite(icons, id, size) : null;
}

const PAGE = BALANCE.training.valueStep;

function boardH(): number {
  return HEAD + boardRows(Math.min(PAGE, BALANCE.training.nodes)) * BOARD_ROW + BOARD_PAD;
}

/** A gold chip saying page `page`'s values are that many times the first page's (×2 on the second). */
function timesChip(page: number, size: number): Container {
  const c = new Container();
  const l = label(t('train.times', { n: page + 1 }), size, COLORS.outline);
  l.anchor.set(0.5);
  const w = l.width + 24;
  const h = size + 14;
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 4 }), l);
  return c;
}

function statsH(lines: number): number {
  return 110 + Math.max(1, Math.ceil(lines / 2)) * LINE_H + 40;
}

export function trainHeight(save: SaveData): number {
  const stats = save.trained > 0 ? GAP + statsH(statLines(trainingStats(save)).length) : 0;
  return boardH() + GAP + CARD_H + stats;
}

/** The tab centred on x = 0 from y = 0 down; `picked` is the node shown in the card. */
export function trainTab(save: SaveData, icons: IconSheet, picked: number | null, actions: TrainActions): Container {
  const c = new Container();
  const bh = boardH();
  const shown = picked ?? nextNode(save)?.n ?? null;
  const page = shown === null ? pageCount(BALANCE.training.nodes, PAGE) - 1 : boardPage(shown, PAGE);
  const board = boardView(save, icons, shown, page, actions);
  board.y = bh / 2;
  c.addChild(board);
  let y = bh + GAP;
  const card = nodeCard(save, icons, shown, actions);
  card.y = y + CARD_H / 2;
  c.addChild(card);
  y += CARD_H;
  // nothing trained yet: no card of dashes
  if (save.trained > 0) {
    const lines = statLines(trainingStats(save));
    const h = statsH(lines.length);
    const stats = statsPanel(t('train.total'), lines, h, W);
    stats.y = y + GAP + h / 2;
    c.addChild(stats);
  }
  return c;
}

/** The board centred on (0, 0): its title (with the page tabs), then page `page`'s path of nodes. */
function boardView(save: SaveData, icons: IconSheet, shown: number | null, page: number, actions: TrainActions): Container {
  const total = BALANCE.training.nodes;
  const pages = pageCount(total, PAGE);
  const { first, last } = pageRange(page, PAGE, total);
  const h = boardH();
  const c = new Container();
  c.addChild(panel(W, h));
  const head = label(t('train.progress', { n: save.trained, total }), 56, COLORS.saffron);
  head.y = -h / 2 + 62;
  c.addChild(head);
  if (pages > 1) {
    // the title moves left for the page tabs on the right
    const tabs = pageTabs(save, page, pages, actions);
    tabs.position.set(W / 2 - 40 - tabs.width, -h / 2 + 62);
    fit(head, W - 130 - tabs.width);
    head.anchor.set(0, 0.5);
    head.x = -W / 2 + 44;
    c.addChild(tabs);
  }
  const top = -h / 2 + HEAD;
  const at = (n: number) => {
    const p = boardPos(n - first + 1);
    return { x: p.x, y: top + p.y };
  };
  // the road under the nodes: lit as far as the training has come, dark beyond
  const road = new Graphics();
  for (const lit of [false, true]) {
    for (let n = first; n < last; n++) {
      if ((n + 1 <= save.trained + 1) !== lit) continue;
      const a = at(n);
      const b = at(n + 1);
      road.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    road.stroke({ color: lit ? BADGE.fill : ROAD, width: lit ? 12 : 8, cap: 'round' });
  }
  c.addChild(road);
  const next = nextNode(save)?.n ?? null;
  for (let n = first; n <= last; n++) {
    const node = nodeView(icons, trainNode(n).stat, n <= save.trained ? 'trained' : n === next ? 'next' : 'future', n === shown && n !== next);
    node.position.copyFrom(at(n));
    node.eventMode = 'static';
    node.cursor = 'pointer';
    node.on('pointertap', () => actions.pick(n));
    c.addChild(node);
  }
  return c;
}

/** The page tabs from x 0 rightwards, centred on y 0: the shown one lit, the later ones with their ×2 chip. */
function pageTabs(save: SaveData, page: number, pages: number, actions: TrainActions): Container {
  const c = new Container();
  const next = nextNode(save)?.n ?? null;
  let x = 0;
  for (let p = 0; p < pages; p++) {
    const { first, last } = pageRange(p, PAGE, BALANCE.training.nodes);
    const on = p === page;
    const l = label(t('train.page', { from: first, to: last }), 40, on ? COLORS.outline : COLORS.text);
    l.anchor.set(0.5);
    const w = l.width + 56;
    const tab = new Container();
    tab.addChild(new Graphics().roundRect(-w / 2, -36, w, 72, 36).fill(on ? COLORS.saffron : SLOT).stroke({ color: on ? COLORS.outline : ROAD, width: 5 }), l);
    if (p > 0) {
      const chip = timesChip(p, 30);
      chip.position.set(w / 2 - 10, -36);
      tab.addChild(chip);
    }
    tab.x = x + w / 2;
    x += w + 18;
    // a page's tab shows the next node when the line is on that page, else the page's first
    tab.eventMode = 'static';
    tab.cursor = 'pointer';
    tab.on('pointertap', () => actions.pick(next !== null && next >= first && next <= last ? null : first));
    c.addChild(tab);
  }
  return c;
}

type NodeState = 'trained' | 'next' | 'future';

/** One node: trained full colour on a lit badge, the next bigger and ringed, the rest grey. */
function nodeView(icons: IconSheet, stat: TrainStat, state: NodeState, picked: boolean): Container {
  const c = new Container();
  const r = state === 'next' ? NEXT_R : NODE_R;
  const color = STAT_COLOR[stat] ?? COLORS.dim;
  if (picked) c.addChild(new Graphics().circle(0, 0, r + 12).stroke({ color: 0xffffff, width: 6 }));
  if (state === 'next') {
    // a saffron ring breathing round the badge, so the next step finds the eye
    const ring = new Graphics().circle(0, 0, r + 8).stroke({ color: COLORS.saffron, width: 7 });
    ring.onRender = () => {
      const p = ringPulse(performance.now() / 1000);
      ring.scale.set(p.scale);
      ring.alpha = p.alpha;
    };
    c.addChild(ring);
  }
  const disc = new Graphics().circle(0, 0, r);
  if (state === 'future') disc.fill(SLOT).stroke({ color: ROAD, width: 5 });
  else disc.fill(BADGE.fill).stroke({ color: state === 'next' ? COLORS.saffron : color, width: state === 'next' ? 9 : 7 });
  c.addChild(disc);
  const icon = statIcon(icons, stat, r * 1.5);
  if (icon) {
    if (state === 'future') lockedLook(icon, true);
    c.addChild(icon);
  }
  return c;
}

function nodeCard(save: SaveData, icons: IconSheet, n: number | null, actions: TrainActions): Container {
  const c = new Container();
  c.addChild(panel(W, CARD_H));
  if (n === null) {
    c.addChild(label(t('train.done'), 56, COLORS.saffron));
    return c;
  }
  const node = trainNode(n);
  const bought = n <= save.trained;
  const isNext = n === save.trained + 1;
  const what = fit(label(statText(node.stat, node.value), 64, STAT_COLOR[node.stat] ?? COLORS.text), 760);
  what.y = -110;
  const icon = statIcon(icons, node.stat, 96);
  if (icon) {
    // the icon and the stat as one centred line
    const w = 96 + 24 + what.width;
    icon.position.set(-w / 2 + 48, -110);
    what.x = -w / 2 + 120 + what.width / 2;
    c.addChild(icon);
  }
  const sub = label(`#${n} · ${t('lobby.level', { level: node.level })}`, 48, COLORS.dim);
  sub.y = -30;
  c.addChild(what, sub);
  // past the first page a node adds that many times more: its ×2 by the stat
  const page = boardPage(n, PAGE);
  if (page > 0 && node.stat !== 'revive') {
    const chip = timesChip(page, 40);
    chip.position.set(what.x + what.width / 2 + 24 + chip.width / 2, -110);
    c.addChild(chip);
  }
  if (bought) return c;
  const block = isNext ? trainBlock(save) : 'level';
  const ok = isNext && block === null;
  const text = block === 'level' && save.level < node.level
    ? t('train.needLevel', { level: node.level })
    : `${t('train.buy')}  ${formatAmount(node.cost)}`;
  const b = button(text, 620, 140, () => {
    if (ok) actions.train();
    else if (isNext && block === 'copper') actions.toast(t('gear.noCopper'));
    else if (!isNext) actions.pick(null);
  }, { fill: ok ? COLORS.saffron : COLORS.panelLocked, textFill: ok ? COLORS.outline : COLORS.dim });
  b.y = 95;
  c.addChild(b);
  return c;
}
