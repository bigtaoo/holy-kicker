import type { SpellKind } from './config';
import type { CardKind } from './content';

// One-shot things that happened during a tick, the only channel from the sim to the view
// (animations, effects, numbers, sounds). Rebuilt every tick; positions are FP. When several
// ticks run in one frame the view gets all of their events.

/** What a hit landed on: a horde mob (by index), an elite or the boss. */
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
  /** The fat monk's belly bounced the enemies within `radius` of (x, y) back. */
  | { type: 'bounce'; owner: number; x: number; y: number; radius: number }
  /** A blow missed the running novice. */
  | { type: 'dodge'; owner: number }
  | { type: 'revive'; owner: number }
  /** A player stood still long enough to enter Zen (Stillness). */
  | { type: 'zen'; owner: number }
  /** Damage dealt. `ball` is set for a ball hit, at the ball's position. */
  | { type: 'hit'; kind: TargetKind; index: number; x: number; y: number; value: number; crit: boolean; ball: boolean; bx: number; by: number }
  /** A mob went down at (x, y), knocked away along (dx, dy), and respawned elsewhere. */
  | { type: 'mobDown'; index: number; x: number; y: number; dx: number; dy: number }
  | { type: 'eliteDown'; id: number; x: number; y: number }
  /** A door god's shield took a relic hit on elite target `index`, standing at (x, y). */
  | { type: 'block'; index: number; x: number; y: number }
  /** Mob `index`, an emerger, rose from its mark at (x, y). */
  | { type: 'emerge'; index: number; x: number; y: number }
  /** A wolf leader howled at (x, y): the mobs within `radius` run fast for a while. */
  | { type: 'howl'; x: number; y: number; radius: number }
  /** The Bone Witch called a skeleton up at (x, y). */
  | { type: 'summon'; x: number; y: number }
  /** The Bone Witch brought her staff down (a summons or a bone fan), or the Judge his brush, standing at (x, y). */
  | { type: 'bossCast'; x: number; y: number }
  /** The carp dived at (x, y). */
  | { type: 'bossDive'; x: number; y: number }
  | { type: 'bossWindup' }
  | { type: 'bossSlam'; x: number; y: number; radius: number }
  | { type: 'bossDown' }
  | { type: 'bossBack' }
  | { type: 'blast'; x: number; y: number; radius: number }
  /** Gems reached a player this tick; `tier` is the biggest of them. */
  | { type: 'pickup'; owner: number; tier: number }
  | { type: 'cast'; kind: SpellKind; x: number; y: number; radius: number }
  /** A palm was cast at (x, y): it lands in `fall` ticks (as a 'meteor' cast), leaving a pinning print for `print` ticks (0 for none). */
  | { type: 'palm'; owner: number; x: number; y: number; radius: number; fall: number; print: number }
  /** A player's Golden Bell came up, or broke on a blow it took for them. */
  | { type: 'bellUp'; owner: number }
  | { type: 'bellBreak'; owner: number }
  /** A lightning bolt; `gold` for the evolved Endless Chain. */
  | { type: 'bolt'; x0: number; y0: number; x1: number; y1: number; gold: boolean }
  /** A lotus seed bloomed at (x, y). */
  | { type: 'bloom'; x: number; y: number; radius: number }
  /** A player's Lion's Roar: a cone around `brad` from (x, y) to `radius`, all round if `full`. */
  | { type: 'roar'; owner: number; x: number; y: number; brad: number; radius: number; full: boolean }
  /** A player reached `level` and has cards to pick (the sim waits for the pick). */
  | { type: 'levelUp'; owner: number; level: number }
  | { type: 'pick'; owner: number; kind: CardKind; id: string }
  /** A wave began (not sent for wave 1, which the run starts on). */
  | { type: 'wave'; wave: number }
  /** The chapter boss fell on the last wave: the run is won. */
  | { type: 'cleared' };
