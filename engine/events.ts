import type { SpellKind } from './config';

// One-shot things that happened during a tick, the only channel from the sim to the view
// (animations, effects, numbers, sounds). Rebuilt every tick; positions are FP. When several
// ticks run in one frame the view gets all of their events.

/** What a hit landed on: a horde mob (by index), the elite or the boss. */
export type TargetKind = 'mob' | 'elite' | 'boss';

export type SimEvent =
  /** A player started a kick toward `dir` (-1 left, 1 right). */
  | { type: 'kick'; owner: number; dir: number }
  | { type: 'hurt'; owner: number }
  /** Damage dealt. `ball` is set for a ball hit, at the ball's position. */
  | { type: 'hit'; kind: TargetKind; index: number; x: number; y: number; value: number; crit: boolean; ball: boolean; bx: number; by: number }
  /** A mob went down at (x, y), knocked away along (dx, dy), and respawned elsewhere. */
  | { type: 'mobDown'; index: number; x: number; y: number; dx: number; dy: number }
  | { type: 'bossWindup' }
  | { type: 'bossSlam'; x: number; y: number; radius: number }
  | { type: 'bossDown' }
  | { type: 'bossBack' }
  | { type: 'blast'; x: number; y: number; radius: number }
  /** Gems reached a player this tick; `tier` is the biggest of them. */
  | { type: 'pickup'; owner: number; tier: number }
  | { type: 'cast'; kind: SpellKind; x: number; y: number; radius: number }
  | { type: 'bolt'; x0: number; y0: number; x1: number; y1: number };
