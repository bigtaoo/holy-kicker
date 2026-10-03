import { ELITE, HERO, type BossKind, type EliteKind, type MobKind, type RunConfig } from './config';
import type { Card, PassiveId, RelicId, SpellId } from './content';
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
  /** Experience toward the next whole point, in hundredths (the xp stat grows gains by percent). */
  xpPart: number;
  hp: number;
  maxHp: number;
  /** Down at 0 health: no moving, kicking or picking up until revived. */
  dead: boolean;
  revives: number;
  /** Health regenerated so far toward the next point, in units of 1 / REGEN_UNIT. */
  regen: number;
  /** The relic played with, and its level, 1..MAX_LEVEL. */
  relicId: RelicId;
  relic: number;
  /** The relic awakened (after MAX_LEVEL with its paired passive). */
  awakened: boolean;
  spells: SpellSlot[];
  passives: PassiveSlot[];
  /** The Golden Bell is up and takes the next blow. */
  bell: boolean;
  /** The level-up or shrine cards on offer; the sim stands still while any player has some. */
  offer: Card[];
  /** An offering stands, paid at the next shrine or the win if the hero is up then. */
  bet: boolean;
  /** Offerings paid so far (extra copper at the results). */
  offerings: number;
  /** Wooden fish taps so far (every FISH.stunEvery-th ring of the Stunning Bell stuns). */
  taps: number;
  /** Halo Beam: the first beam's angle, brads. */
  halo: number;
}

export interface SpellSlot {
  id: SpellId;
  level: number;
  /** Ticks to the next cast. */
  cd: number;
  evolved: boolean;
}

export interface PassiveSlot {
  id: PassiveId;
  level: number;
}

export interface Mob extends Body {
  kind: MobKind;
  hp: number;
  /** Ticks left standing stunned (the Stunning Bell). */
  stun: number;
  /** An emerger: ticks until it rises (0 once up). A shooter: ticks to its next volley. */
  t: number;
}

/** An emerger still under the ground (or rising from its mark) cannot be hit, hurt or moved. */
export function underground(m: Mob): boolean {
  return m.kind === 'emerger' && m.t > 0;
}

/**
 * The elite walks in, then aims a charge, dashes along it and catches its breath; a toad king
 * swells (aim) and spits, then sits (rest).
 */
export type ElitePhase = 'walk' | 'aim' | 'dash' | 'rest';

export interface Elite extends Body {
  /** Stable while it stands, so the view can tell the twins apart as others fall. */
  id: number;
  kind: EliteKind;
  hp: number;
  maxHp: number;
  stun: number;
  phase: ElitePhase;
  /** Attacks made: a toad king takes turns between its fan and its pools. */
  shots: number;
  /** Ticks into the phase. */
  t: number;
  /** Ticks until it may charge again. */
  cd: number;
  /** The charge's velocity per tick, set when it aims. */
  vx: number;
  vy: number;
}

/** Still going, the chapter boss fell (won) or every hero is down (lost, until a revive). */
export type Outcome = 'playing' | 'won' | 'lost';

/** The carp adds 'dive' (under water, swimming after the hero) and 'rise' (its circle locked). */
export type BossPhase = 'walk' | 'windup' | 'recover' | 'down' | 'dive' | 'rise';

export interface Boss extends Body {
  kind: BossKind;
  phase: BossPhase;
  /** Ticks into the phase. */
  t: number;
  cooldown: number;
  zoneX: number;
  zoneY: number;
  hp: number;
  maxHp: number;
  /** The empowered mid-boss (EMPOWERED): its slams also send out a bullet ring. */
  empowered: boolean;
}

/** Under water (the carp diving or rising): out of reach, and nothing to bump into. */
export function submerged(b: Boss): boolean {
  return b.phase === 'dive' || b.phase === 'rise';
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
  /** An awakened ball sends splinters at every bounce; splinters themselves do not. */
  split: boolean;
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
  /** Damage when it goes off. */
  hurt: number;
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
  /** Mountain Palm: mobs inside cannot move. */
  pin: boolean;
  /** Healing Incense: per mille of the owner's max health healed per field tick inside. */
  heal: number;
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
  /** Cymbal Wheel: circles its owner at this radius forever (0 for a thrown one). */
  orbit: number;
  /** Angle around the owner, brads. */
  angle: number;
}

/** A wooden fish's sound ring: grows from where it was tapped and hits each target once. */
export interface Ring {
  id: number;
  owner: number;
  x: number;
  y: number;
  radius: number;
  reach: number;
  damage: number;
  /** Ticks it stuns what it hits (0 for an ordinary ring). */
  stun: number;
  /** Targets it already hit (combat.ts numbering). */
  hit: number[];
}

/** A prayer bead: circles its owner on ring `ring` and hits what it touches once per pass. */
export interface Bead extends Body {
  id: number;
  owner: number;
  ring: number;
  /** Angle around the owner, brads. */
  angle: number;
  /** Targets it touches now (combat.ts numbering): hit when they come in, again only after they left. */
  touching: number[];
}

/** A Lotus Steps seed: waits on the ground and blooms when an enemy steps on it. */
export interface Lotus {
  id: number;
  owner: number;
  x: number;
  y: number;
  radius: number;
  damage: number;
  age: number;
  life: number;
  /** Lotus Path: the bloom sends the gems near it to the hero. */
  pull: boolean;
}

/** A thrown alms bowl: flies out, turns at its reach and comes back to its owner. */
export interface Bowl extends Body {
  id: number;
  owner: number;
  vx: number;
  vy: number;
  /** Distance left on the way out; coming back once it runs out. */
  travel: number;
  back: boolean;
  damage: number;
  /** Mobs it may carry (or swallow, awakened) this throw. */
  carry: number;
  /** Bottomless Bowl: swallows instead of carrying. */
  swallow: boolean;
  /** Mobs swallowed so far. */
  swallowed: number;
  /** Targets hit on this leg (combat.ts numbering). */
  hit: number[];
  /** Mobs dragged along on the way out. */
  carried: number[];
}

export interface SimState {
  readonly config: RunConfig;
  tick: number;
  nextId: number;
  players: Player[];
  mobs: Mob[];
  /** The elites standing (big jiangshi, chargers): one on elite waves, the twins on the mid-boss wave. */
  elites: Elite[];
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
  rings: Ring[];
  beads: Bead[];
  bowls: Bowl[];
  lotuses: Lotus[];
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
    config, tick: 0, nextId: 1, players: [], mobs: [], elites: [], boss: null, balls: [], bullets: [], zones: [],
    gems: [], gemCells: new Map(), resting: 0, overflow: null, fields: [], cymbals: [], rings: [], beads: [], bowls: [], lotuses: [],
    volleyT: 0, zoneT: 0, spellT: 0, spellNext: 0, wave: 0, waveT: 0, outcome: 'playing',
    ai: new Prng(s ^ 0x1a2b3c4d), combat: new Prng(s ^ 0x5e6f7081), drop: new Prng(s ^ 0x92a3b4c5), spell: new Prng(s ^ 0xd6e7f809),
    cards: new Prng(s ^ 0x3c5a7e91),
  };
}

export function newMob(x: number, y: number, hp = 1, kind: MobKind = 'chaser', t = 0): Mob {
  return { ...body(x, y), kind, hp, stun: 0, t };
}

export function newPlayer(owner: number, x: number, y: number, hp = HERO.hp, revives = 0, relicId: RelicId = 'ball'): Player {
  return {
    ...body(x, y), owner, vx: 0, vy: 0, facing: -1, moving: false, moveBrad: 0, moveMag: 0,
    action: 'none', actionT: 0, struck: false, kickCd: 0, hurtCd: 0, level: 1, xp: 0, xpPart: 0,
    hp, maxHp: hp, dead: false, revives, regen: 0, relicId, relic: 1, awakened: false, spells: [], passives: [], bell: false, offer: [],
    bet: false, offerings: 0, taps: 0, halo: 0,
  };
}

export function newElite(x: number, y: number, id = 0, hp = ELITE.hp, cd = ELITE.cooldown, kind: EliteKind = 'charger'): Elite {
  return { ...body(x, y), id, kind, hp, maxHp: hp, stun: 0, phase: 'walk', shots: 0, t: 0, cd, vx: 0, vy: 0 };
}
