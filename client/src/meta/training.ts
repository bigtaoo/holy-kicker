import type { Stat } from '@hk/engine';
import { BALANCE } from './balance';
import type { SaveData } from './save';

// Training (docs/design.md "Meta progression"): a single fixed line of nodes, bought in order
// with copper; node n opens at player level n + 1. Plain stats on a repeating cycle, with an
// extra free revive on a few nodes. `copper` (more copper from runs) and `revive` act outside
// the engine; the rest are engine stats.

export type TrainStat = Stat | 'copper' | 'revive';

export interface TrainingBalance {
  nodes: number;
  /** The stats the line repeats, with what each node adds. */
  cycle: [TrainStat, number][];
  /** Nodes (1-based) that give a free revive instead of their cycle stat. */
  reviveNodes: number[];
  costBase: number;
  costStep: number;
}

export interface TrainNode {
  /** 1-based place on the line. */
  n: number;
  stat: TrainStat;
  value: number;
  cost: number;
  /** The player level that opens it. */
  level: number;
}

const TRAIN = BALANCE.training;

export function trainNode(n: number): TrainNode {
  const [stat, value]: [TrainStat, number] = TRAIN.reviveNodes.includes(n) ? ['revive', 1] : TRAIN.cycle[(n - 1) % TRAIN.cycle.length];
  return { n, stat, value, cost: TRAIN.costBase + TRAIN.costStep * (n - 1), level: n + 1 };
}

/** The next node to buy, or null once the line is done. */
export function nextNode(save: SaveData): TrainNode | null {
  return save.trained < TRAIN.nodes ? trainNode(save.trained + 1) : null;
}

export type TrainBlock = 'done' | 'level' | 'copper' | null;

/** Why the next node cannot be bought now, or null when it can. */
export function trainBlock(save: SaveData): TrainBlock {
  const node = nextNode(save);
  if (!node) return 'done';
  if (save.level < node.level) return 'level';
  return save.copper < node.cost ? 'copper' : null;
}

export function train(save: SaveData): SaveData {
  const node = nextNode(save);
  if (!node || trainBlock(save)) return save;
  return { ...save, copper: save.copper - node.cost, trained: save.trained + 1 };
}

/** What the bought nodes add up to. */
export function trainingStats(save: SaveData): Partial<Record<TrainStat, number>> {
  const out: Partial<Record<TrainStat, number>> = {};
  for (let n = 1; n <= save.trained; n++) {
    const node = trainNode(n);
    out[node.stat] = (out[node.stat] ?? 0) + node.value;
  }
  return out;
}
