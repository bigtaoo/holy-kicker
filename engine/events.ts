import type { SpellKind } from './config';
import type { CardKind } from './content';

// One-shot things that happened during a tick, the only channel from the sim to the view
// (animations, effects, numbers, sounds). Rebuilt every tick; positions are FP. When several
// ticks run in one frame the view gets all of their events.

/** What a hit landed on: a horde mob (by index), the elite or the boss. */
export type TargetKind = 'mob' | 'elite' | 'boss';

export type SimEvent =
  /** A player started a kick toward `dir` (-1 left, 1 right). */
  | { type: 'kick'; owner: number; dir: number }
  /** A player's staff landed: centred on (x, y), a half circle around `brad` (all round if `full`). */
  | { type: 'sweep'; owner: number; x: number; y: number; brad: number; reach: number; full: boolean }
  /** A player tapped the wooden fish: a ring grows from (x, y) to `reach`; `stun` for the Stunning Bell's fourth. */
  | { type: 'ring'; owner: number; x: number; y: number; reach: number; stun: boolean }
  /** A player took `value` damage (0 in the sandbox, where heroes cannot die). */
  | { type: 'hurt'; owner: number; value: number }
  | { type: 'heroDown'; owner: number }
  | { type: 'revive'; owner: number }
  /** Damage dealt. `ball` is set for a ball hit, at the ball's position. */
  | { type: 'hit'; kind: TargetKind; index: number; x: number; y: number; value: number; crit: boolean; ball: boolean; bx: number; by: number }
  /** A mob went down at (x, y), knocked away along (dx, dy), and respawned elsewhere. */
  | { type: 'mobDown'; index: number; x: number; y: number; dx: number; dy: number }
  | { type: 'eliteDown'; x: number; y: number }
  | { type: 'bossWindup' }
  | { type: 'bossSlam'; x: number; y: number; radius: number }
  | { type: 'bossDown' }
  | { type: 'bossBack' }
  | { type: 'blast'; x: number; y: number; radius: number }
  /** Gems reached a player this tick; `tier` is the biggest of them. */
  | { type: 'pickup'; owner: number; tier: number }
  | { type: 'cast'; kind: SpellKind; x: number; y: number; radius: number }
  /** A player's Golden Bell came up, or broke on a blow it took for them. */
  | { type: 'bellUp'; owner: number }
  | { type: 'bellBreak'; owner: number }
  | { type: 'bolt'; x0: number; y0: number; x1: number; y1: number }
  /** A player reached `level` and has cards to pick (the sim waits for the pick). */
  | { type: 'levelUp'; owner: number; level: number }
  | { type: 'pick'; owner: number; kind: CardKind; id: string }
  /** A wave began (not sent for wave 1, which the run starts on). */
  | { type: 'wave'; wave: number }
  /** The chapter boss fell on the last wave: the run is won. */
  | { type: 'cleared' };
