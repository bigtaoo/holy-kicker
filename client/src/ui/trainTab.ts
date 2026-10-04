import { Container, Graphics } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import type { SaveData } from '../meta/save';
import { nextNode, trainBlock, trainingStats, trainNode, type TrainStat } from '../meta/training';
import { statsPanel } from './gearTab';
import { statLines, statText } from './statText';
import { COLORS, button, fit, label, panel } from './widgets';

// The lobby's Train tab (docs/design.md "Training"): the whole line as a grid of nodes in
// order (bought ones filled, the next one ringed, those past the player's level dimmed), the
// next node with its cost and the Train button, and what the bought nodes add up to. Tapping
// a node shows what it gives and the level that opens it.

export interface TrainActions {
  train(): void;
  /** Shows node `n` in the card (null: the next one). */
  pick(n: number | null): void;
  toast(text: string): void;
}

const COLS = 10;
const STEP = 98;
const NODE_R = 36;
const CARD_H = 380;
const LINE_H = 62;

/** One colour per stat, so the line reads as a pattern. */
const STAT_COLOR: Partial<Record<TrainStat, number>> = {
  attack: 0xf07040, maxHp: 0xe04a5a, xp: 0x5aa8f0, copper: COLORS.copper, magnet: COLORS.jade, revive: 0xffd860,
};

function statsH(lines: number): number {
  return 110 + Math.max(1, Math.ceil(lines / 2)) * LINE_H + 40;
}

export function trainHeight(save: SaveData): number {
  const rows = Math.ceil(BALANCE.training.nodes / COLS);
  return 110 + rows * STEP + 40 + CARD_H + 40 + statsH(statLines(trainingStats(save)).length);
}

/** The tab centred on x = 0 from y = 0 down; `picked` is the node shown in the card. */
export function trainTab(save: SaveData, picked: number | null, actions: TrainActions): Container {
  const c = new Container();
  const total = BALANCE.training.nodes;
  const head = label(t('train.progress', { n: save.trained, total }), 64);
  head.y = 45;
  c.addChild(head);
  const next = nextNode(save);
  for (let n = 1; n <= total; n++) {
    const node = trainNode(n);
    const bought = n <= save.trained;
    const isNext = next?.n === n;
    const open = save.level >= node.level;
    const color = STAT_COLOR[node.stat] ?? COLORS.dim;
    const g = new Graphics();
    if (n === picked) g.circle(0, 0, NODE_R + 14).fill({ color: 0xffffff, alpha: 0.25 });
    g.circle(0, 0, NODE_R).fill(bought ? color : COLORS.panelLocked)
      .stroke({ color: isNext ? COLORS.saffron : bought ? COLORS.outline : open ? color : 0x3a443f, width: isNext ? 9 : 6 });
    if (node.stat === 'revive') g.star(0, 0, 5, NODE_R * 0.55, NODE_R * 0.25).fill(bought ? COLORS.outline : 0xffd860);
    g.position.set((((n - 1) % COLS) - (COLS - 1) / 2) * STEP, 110 + Math.floor((n - 1) / COLS) * STEP + STEP / 2);
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointertap', () => actions.pick(n));
    c.addChild(g);
  }
  let y = 110 + Math.ceil(total / COLS) * STEP + 40;
  const card = nodeCard(save, picked ?? next?.n ?? null, actions);
  card.y = y + CARD_H / 2;
  c.addChild(card);
  y += CARD_H + 40;
  const lines = statLines(trainingStats(save));
  const h = statsH(lines.length);
  const stats = statsPanel(t('train.total'), lines, h);
  stats.y = y + h / 2;
  c.addChild(stats);
  return c;
}

function nodeCard(save: SaveData, n: number | null, actions: TrainActions): Container {
  const c = new Container();
  c.addChild(panel(1000, CARD_H));
  if (n === null) {
    c.addChild(label(t('train.done'), 56, COLORS.saffron));
    return c;
  }
  const node = trainNode(n);
  const bought = n <= save.trained;
  const isNext = n === save.trained + 1;
  const what = fit(label(statText(node.stat, node.value), 64, STAT_COLOR[node.stat] ?? COLORS.text), 900);
  what.y = -110;
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
