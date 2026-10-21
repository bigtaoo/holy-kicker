import { Container, Graphics } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { SaveData } from '../meta/save';
import { nextNode, trainBlock, trainingStats, trainNode, type TrainStat } from '../meta/training';
import { iconSprite, lockedLook, type IconSheet } from './buildBar';
import { statsPanel } from './gearTab';
import { BADGE } from './playCard';
import { statLines, statText } from './statText';
import { boardPos, boardRows, BOARD_ROW, ringPulse } from './trainBoard';
import { COLORS, button, fit, label, panel } from './widgets';

// The lobby's Train tab (docs/design.md "Training", "Lobby layout"): the whole line on its own
// dark board as a path of nodes in three plain states (trained: full colour on a lit badge;
// next: a bigger lit badge in a breathing saffron ring; the rest: grey silhouettes on dark
// discs), the picked node's card with the Train button, and what the trained nodes add up to
// (only once there is something). Tapping a node shows what it gives and the level that opens it.

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
  attack: 0xf07040, maxHp: 0xe04a5a, xp: 0x5aa8f0, copper: COLORS.copper, magnet: COLORS.jade, revive: 0xffd860,
};

/** Each stat's painted icon on the icon sheet (art/monk/icons/train_*). */
const STAT_ICON: Partial<Record<TrainStat, string>> = {
  attack: 'train_attack', maxHp: 'train_hp', xp: 'train_xp', copper: 'train_copper', magnet: 'train_magnet', revive: 'train_revive',
};

function statIcon(icons: IconSheet, stat: TrainStat, size: number) {
  const id = STAT_ICON[stat];
  return id ? iconSprite(icons, id, size) : null;
}

function boardH(): number {
  return HEAD + boardRows(BALANCE.training.nodes) * BOARD_ROW + BOARD_PAD;
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
  const board = boardView(save, icons, shown, actions);
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

/** The board centred on (0, 0): its title, then the path of nodes. */
function boardView(save: SaveData, icons: IconSheet, shown: number | null, actions: TrainActions): Container {
  const total = BALANCE.training.nodes;
  const h = boardH();
  const c = new Container();
  c.addChild(panel(W, h));
  const head = label(t('train.progress', { n: save.trained, total }), 56, COLORS.saffron);
  head.y = -h / 2 + 62;
  c.addChild(head);
  const top = -h / 2 + HEAD;
  const at = (n: number) => {
    const p = boardPos(n);
    return { x: p.x, y: top + p.y };
  };
  // the road under the nodes: lit as far as the training has come, dark beyond
  const road = new Graphics();
  for (const lit of [false, true]) {
    for (let n = 1; n < total; n++) {
      if ((n + 1 <= save.trained + 1) !== lit) continue;
      const a = at(n);
      const b = at(n + 1);
      road.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    road.stroke({ color: lit ? BADGE.fill : ROAD, width: lit ? 12 : 8, cap: 'round' });
  }
  c.addChild(road);
  const next = nextNode(save)?.n ?? null;
  for (let n = 1; n <= total; n++) {
    const node = nodeView(icons, trainNode(n).stat, n <= save.trained ? 'trained' : n === next ? 'next' : 'future', n === shown && n !== next);
    node.position.copyFrom(at(n));
    node.eventMode = 'static';
    node.cursor = 'pointer';
    node.on('pointertap', () => actions.pick(n));
    c.addChild(node);
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
