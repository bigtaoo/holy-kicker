import { achievementsReady } from './achievements';
import { claimable, tasksOpen } from './daily';
import { mergeAll } from './gear';
import { goalsClaimable } from './goals';
import { BALANCE } from './balance';
import { meritClaimable } from './merit';
import { patrolHours, patrolOpen } from './patrol';
import { tabLock } from './progress';
import { chestsWaitingCount } from './progressChests';
import type { SaveData } from './save';
import { chestsLeft } from './shop';
import { nextNode, train, trainBlock, type TrainStat } from './training';
import { giftReady, nextGift } from './welcome';

// What waits in the lobby for the player to claim or buy: the source of the lobby's red badges
// (the Play tab's chests, Patrol, Tasks and the gift, the Shop's free chest, the Train tab) and
// of the results screen's count on "Collect in the lobby", so the two always agree: every thing
// counted here has a badge on its tab and on its button. Pure, so it is tested without Pixi.

export interface Waiting {
  /** Progress chests reached and not yet opened, both tracks. */
  chests: number;
  /** Daily tasks (and the day's bonus) ready to claim. */
  tasks: number;
  /** Weekly goals (and the week's chest) ready to claim. */
  goals: number;
  /** Merit path steps reached and not yet paid. */
  merit: number;
  /** Achievements reached and not yet claimed. */
  achievements: number;
  /** The next training node can be bought now. */
  train: boolean;
  /** The Shop's free chest of the day is still there (and the Shop is open). */
  shop: boolean;
  /** Today's welcome gift waits (the right rail's Gift button). */
  gift: boolean;
  /** The patrol is full: it earns nothing more until collected. */
  patrol: boolean;
}

export function lobbyWaiting(save: SaveData, now: number): Waiting {
  const tasks = tasksOpen(save);
  return {
    chests: chestsWaitingCount(save),
    tasks: tasks ? claimable(save, now) : 0,
    goals: tasks ? goalsClaimable(save, now) : 0,
    merit: tasks ? meritClaimable(save, now) : 0,
    achievements: tasks ? achievementsReady(save).length : 0,
    train: canTrain(save),
    shop: !tabLock(save, 'shop') && chestsLeft(save, now, 'free') === 1,
    gift: save.firstRunDone && nextGift(save) !== null && giftReady(save, now),
    patrol: patrolOpen(save) && patrolHours(save, now) >= BALANCE.patrol.capHours,
  };
}

/** The things waiting on the Tasks button: its panel's four pages. */
export function tasksWaiting(w: Waiting): number {
  return w.tasks + w.goals + w.merit + w.achievements;
}

/** The things waiting behind a tab, the number on its badge: the Play tab holds the chests and the rails. */
export function tabWaiting(w: Waiting, tab: 'play' | 'shop' | 'train'): number {
  if (tab === 'shop') return w.shop ? 1 : 0;
  if (tab === 'train') return w.train ? 1 : 0;
  return w.chests + tasksWaiting(w) + (w.gift ? 1 : 0) + (w.patrol ? 1 : 0);
}

/** The things waiting, each training node buyable counting once (the Train tab has one badge). */
export function waitingCount(w: Waiting): number {
  return tabWaiting(w, 'play') + tabWaiting(w, 'shop') + tabWaiting(w, 'train');
}

/** The Train tab is open and its next node affordable. */
export function canTrain(save: SaveData): boolean {
  return !tabLock(save, 'train') && trainBlock(save) === null;
}

/** The training nodes the copper buys now, one after another, and what they add up to. */
export function affordableTraining(save: SaveData): { n: number; stats: Partial<Record<TrainStat, number>> } {
  const stats: Partial<Record<TrainStat, number>> = {};
  let n = 0;
  for (let s = save; canTrain(s); s = train(s)) {
    const node = nextNode(s)!;
    stats[node.stat] = (stats[node.stat] ?? 0) + node.value;
    n++;
  }
  return { n, stats };
}

/** How many gear merges the copper allows now (the Gear tab's "Merge all"); 0 while the tab is closed. */
export function mergesReady(save: SaveData): number {
  return tabLock(save, 'gear') ? 0 : mergeAll(save).done.length;
}

/** The one thing a lost run's results point to in the lobby, or null for nothing worth the trip. */
export type NextStep = { tab: 'train'; n: number; stats: Partial<Record<TrainStat, number>> } | { tab: 'gear'; n: number };

/** After a loss: the training the copper buys first (it is what makes the next run go further), else the gear merges. */
export function lossStep(save: SaveData): NextStep | null {
  const training = affordableTraining(save);
  if (training.n > 0) return { tab: 'train', ...training };
  const merges = mergesReady(save);
  return merges > 0 ? { tab: 'gear', n: merges } : null;
}
