import { ELITE, HERO, type RunConfig } from './config';
import type { Card, PassiveId, SpellId } from './content';
import { Prng } from './math/prng';

// The whole simulation state: plain data, integers only (FP positions, tick timers), in
// ordered arrays whose order is the iteration order. Every moving thing keeps the position it
// had at the start of the last tick (px, py), so the view can interpolate between the two.

export interface Body {
  x: number;
  y: number;
  px: number;
  py: number;
}

export type HeroAction = 'none' | 'kick' | 'hurt';

export interface Player extends Body {
  owner: number;
  vx: number;
  vy: number;
  /** -1 facing left, 1 right. */
  facing: number;
  moving: boolean;
  /** Last command, held while no new one arrives. */
  moveBrad: number;
  moveMag: number;
  action: HeroAction;
  /** Ticks into the current action. */
  actionT: number;
  struck: boolean;
  kickCd: number;
  hurtCd: number;
  /** 1-based; `xp` counts toward the next level. */
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  /** Down at 0 health: no moving, kicking or picking up until revived. */
  dead: boolean;
  revives: number;
  /** Health regenerated so far toward the next point, in units of 1 / REGEN_UNIT. */
  regen: number;
  /** Relic level, 1..MAX_LEVEL. */
  relic: number;
  spells: SpellSlot[];
  passives: PassiveSlot[];
  /** The Golden Bell is up and takes the next blow. */
  bell: boolean;
  /** The level-up cards on offer; the sim stands still while any player has some. */
  offer: Card[];
}

export interface SpellSlot {
  id: SpellId;
  level: number;
  /** Ticks to the next cast. */
  cd: number;
}

export interface PassiveSlot {
  id: PassiveId;
  level: number;
}

export interface Mob extends Body {
  hp: number;
}

export interface Elite extends Body {
  hp: number;
  maxHp: number;
}

/** Still going, the chapter boss fell (won) or every hero is down (lost, until a revive). */
export type Outcome = 'playing' | 'won' | 'lost';

export type BossPhase = 'walk' | 'windup' | 'recover' | 'down';

export interface Boss extends Body {
  phase: BossPhase;
  /** Ticks into the phase. */
  t: number;
  cooldown: number;
  zoneX: number;
  zoneY: number;
  hp: number;
  maxHp: number;
}

export interface Ball extends Body {
  id: number;
  owner: number;
  vx: number;
  vy: number;
  hits: number;
  /** Bounces and damage percent, from the relic level it was kicked at. */
  maxHits: number;
  damage: number;
  /** The target hit last, so the ball does not hit it again on the way out. */
  last: number;
  travel: number;
}

export interface Bullet extends Body {
  vx: number;
  vy: number;
  age: number;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
  age: number;
}

export interface Gem extends Body {
  vx: number;
  vy: number;
  value: number;
  /** 0.. by value, OVERFLOW_TIER for the overflow gem. */
  tier: number;
  /** Ticks since dropped, or since it started flying. */
  age: number;
  flying: boolean;
  /** Merge cell it rests in; -1 for the overflow gem. */
  cell: number;
}

export interface Field {
  id: number;
  owner: number;
  x: number;
  y: number;
  radius: number;
  life: number;
  damage: number;
  age: number;
  next: number;
}

/** A thrown cymbal: flies straight and hits everything it passes, each target once. */
export interface Cymbal extends Body {
  id: number;
  owner: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  age: number;
  life: number;
  /** Targets it already hit (combat.ts numbering), so each is hit once. */
  hit: number[];
}

export interface SimState {
  readonly config: RunConfig;
  tick: number;
  nextId: number;
  players: Player[];
  mobs: Mob[];
  /** The elite fox; null when the run has none, or it fell. */
  elite: Elite | null;
  boss: Boss | null;
  balls: Ball[];
  bullets: Bullet[];
  zones: Zone[];
  gems: Gem[];
  /** Resting gems by merge cell; derived from `gems`, so not hashed. */
  gemCells: Map<number, Gem>;
  resting: number;
  /** The overflow gem (also in `gems`); derived, not hashed. */
  overflow: Gem | null;
  fields: Field[];
  cymbals: Cymbal[];
  volleyT: number;
  zoneT: number;
  spellT: number;
  spellNext: number;
  /** 1-based; 0 in the sandbox. */
  wave: number;
  /** Ticks into the wave. */
  waveT: number;
  outcome: Outcome;
  readonly ai: Prng;
  readonly combat: Prng;
  readonly drop: Prng;
  readonly spell: Prng;
  /** Level-up cards. */
  readonly cards: Prng;
}

export function body(x: number, y: number): Body {
  return { x, y, px: x, py: y };
}

/** Moves a body without interpolating (a respawn or teleport). */
export function teleport(b: Body, x: number, y: number): void {
  b.x = b.px = x;
  b.y = b.py = y;
}

export function createState(config: RunConfig): SimState {
  const s = config.seed;
  return {
    config, tick: 0, nextId: 1, players: [], mobs: [], elite: null, boss: null, balls: [], bullets: [], zones: [],
    gems: [], gemCells: new Map(), resting: 0, overflow: null, fields: [], cymbals: [],
    volleyT: 0, zoneT: 0, spellT: 0, spellNext: 0, wave: 0, waveT: 0, outcome: 'playing',
    ai: new Prng(s ^ 0x1a2b3c4d), combat: new Prng(s ^ 0x5e6f7081), drop: new Prng(s ^ 0x92a3b4c5), spell: new Prng(s ^ 0xd6e7f809),
    cards: new Prng(s ^ 0x3c5a7e91),
  };
}

export function newMob(x: number, y: number, hp = 1): Mob {
  return { ...body(x, y), hp };
}

export function newPlayer(owner: number, x: number, y: number, hp = HERO.hp, revives = 0): Player {
  return {
    ...body(x, y), owner, vx: 0, vy: 0, facing: -1, moving: false, moveBrad: 0, moveMag: 0,
    action: 'none', actionT: 0, struck: false, kickCd: 0, hurtCd: 0, level: 1, xp: 0,
    hp, maxHp: hp, dead: false, revives, regen: 0, relic: 1, spells: [], passives: [], bell: false, offer: [],
  };
}

export function newElite(x: number, y: number): Elite {
  return { ...body(x, y), hp: ELITE.hp, maxHp: ELITE.hp };
}
