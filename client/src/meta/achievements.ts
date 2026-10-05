import { BALANCE } from './balance';
import { ITEM_IDS, TIERS } from './gear';
import type { SaveData } from './save';

// Achievements (docs/design.md "Retention"): long-term goals that each pay jade once, claimed
// in the tasks panel. Progress is read from what the save already keeps (plus the lifetime
// kills), so a goal reached before the achievements existed simply waits to be claimed. Pure:
// functions take a save and return a new one.

export type AchievementKind = 'runs' | 'kills' | 'clear' | 'hard' | 'codex' | 'level' | 'trained' | 'tier' | 'monks';

/**
 * Finish `n` runs, defeat `n` enemies, clear chapter `n` (or hard chapter `n`), record `n` Codex
 * entries, reach level `n`, buy `n` training nodes, own an item of tier `n` (gear.ts Tier) or
 * own `n` monks; it pays `jade` once.
 */
export interface AchievementGoal {
  kind: AchievementKind;
  n: number;
  jade: number;
}

export type AchievementState = 'open' | 'ready' | 'claimed';

const GOALS = BALANCE.achievements;

/** The best tier owned of any item, -1 for none. */
function bestTier(save: SaveData): number {
  let best = -1;
  for (const id of ITEM_IDS) for (let t = best + 1; t < TIERS; t++) if (save.gear[id][t] > 0) best = t;
  return best;
}

function bits(n: number): number {
  let c = 0;
  for (let v = n; v > 0; v >>= 1) c += v & 1;
  return c;
}

/** Where the save stands on a goal's kind, in the goal's own unit. */
export function achievementProgress(save: SaveData, kind: AchievementKind): number {
  switch (kind) {
    case 'runs':
      return save.runs;
    case 'kills':
      return save.kills;
    case 'clear':
      return save.cleared;
    case 'hard':
      return save.hardCleared;
    case 'codex':
      return save.codex.length;
    case 'level':
      return save.level;
    case 'trained':
      return save.trained;
    case 'tier':
      return Math.max(0, bestTier(save));
    case 'monks':
      return bits(save.monks);
  }
}

export function achievementState(save: SaveData, i: number): AchievementState {
  if (save.achieved & (1 << i)) return 'claimed';
  const g = GOALS[i];
  return achievementProgress(save, g.kind) >= g.n ? 'ready' : 'open';
}

/** Indexes of the achievements reached and not yet claimed. */
export function achievementsReady(save: SaveData): number[] {
  return GOALS.flatMap((_, i) => (achievementState(save, i) === 'ready' ? [i] : []));
}

/** Indexes in the order the panel lists them: ready first, then open, the claimed last. */
export function achievementOrder(save: SaveData): number[] {
  const rank = { ready: 0, open: 1, claimed: 2 };
  return GOALS.map((_, i) => i).sort((a, b) => rank[achievementState(save, a)] - rank[achievementState(save, b)] || a - b);
}

export function achievementsClaimed(save: SaveData): number {
  return bits(save.achieved);
}

/** Pays achievement `i` when it is reached and not yet claimed. */
export function claimAchievement(save: SaveData, i: number): SaveData {
  if (achievementState(save, i) !== 'ready') return save;
  return { ...save, jade: save.jade + GOALS[i].jade, achieved: save.achieved | (1 << i) };
}

/** Pays every reached achievement at once. */
export function claimAllAchievements(save: SaveData): SaveData {
  return achievementsReady(save).reduce(claimAchievement, save);
}

/** The jade every reached achievement would pay now. */
export function readyJade(save: SaveData): number {
  return achievementsReady(save).reduce((n, i) => n + GOALS[i].jade, 0);
}
