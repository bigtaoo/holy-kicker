import { FP, perTick, TICK_RATE, ticks, toFp } from './math/fixed';
import { degToBrad } from './math/trig';
import type { RelicId, SutraId } from './content';

// Run configuration (what a match is set up with, part of a replay) and the tuning numbers,
// all converted once at load into FP units per tick and whole ticks.

export type SpellKind = 'nova' | 'meteor' | 'field' | 'chain';
export const SPELL_KINDS: readonly SpellKind[] = ['nova', 'meteor', 'field', 'chain'];

export interface RunConfig {
  seed: number;
  players: number;
  mobs: number;
  /** Mobs closer than this (world units) push apart; jammed mobs wait instead of pressing on. */
  sep: number;
  queue: boolean;
  /** Share of the gap to the stick speed the hero closes per tick, per mille (1000 = instant). */
  heroEase: number;
  elite: boolean;
  boss: boolean;
  threats: boolean;
  /** Area spells cast round-robin around the hero (stress test), casts per second. */
  spells: readonly SpellKind[];
  spellRate: number;
  /** Gems scattered around the start (stress test). */
  drops: number;
  /**
   * Waves in the chapter (systems/waves.ts): the horde grows wave by wave, elites and bosses
   * come on their waves, the hero can die and the run ends won or lost. 0 is the sandbox for
   * stress and readability tests: a fixed horde of `mobs`, the boss coming back, no death.
   */
  waves: number;
  /** Revives the hero has for the run (a rewarded ad on the death screen). */
  revives: number;
  /** The relic every hero plays the run with. */
  relic: RelicId;
  /** Sutras the player has: their spells and passives join the level-up pool. */
  sutras: readonly SutraId[];
  /** The chapter played (1-based): which kinds of mob join the horde (CHAPTER_MOBS). */
  chapter: number;
}

export const DEFAULT_RUN: RunConfig = {
  seed: 1, players: 1, mobs: 40, sep: 75, queue: true, heroEase: 379, elite: true, boss: true,
  threats: false, spells: [], spellRate: 1, drops: 0, waves: 0, revives: 1, relic: 'ball', sutras: [], chapter: 1,
};

/** The smooth hero ease, 1 - exp(-tick / 0.07 s), as a constant so no exp runs in the sim. */
export const HERO_EASE_SMOOTH = 379;
export const HERO_EASE_LOCKED = 1000;

export const HERO = {
  speed: perTick(420),
  kickRange: toFp(650),
  /** A kick that connects looks a little further, so a target stepping back is still hit. */
  strikeRange: toFp(845),
  /** Ticks from the start of the kick to the foot meeting the ball (hero_tao.json "kick"). */
  strikeAt: ticks(0.18),
  kickTicks: ticks(0.4),
  hurtTicks: ticks(0.35),
  hurtDist: toFp(85),
  hurtCooldown: ticks(1),
  footOffset: toFp(40),
  /** Above this stick magnitude (of 255) the hero counts as moving. */
  moveMag: 26,
  hp: 100,
  /** After a revive: untouchable this long, and the horde this close is sent back to the ring. */
  reviveGuard: ticks(2),
  reviveClear: toFp(600),
};

/** Health the hero loses per blow, by source (at most one blow per HERO.hurtCooldown). */
export const HURT = {
  mob: 6,
  /** Mob contact hurts this much more every 10 waves. */
  mobPerTenWaves: 1,
  swarm: 3,
  elite: 12,
  charge: 22,
  boss: 15,
  slam: 25,
  bullet: 6,
  zone: 15,
  /** A toad king's poison pool going off. */
  pool: 12,
  /** A water ghost rising under the hero. */
  emerge: 6,
};

export const HORDE = {
  speed: perTick(110),
  stopDist: toFp(70),
  respawnDist: toFp(2200),
  ringMin: toFp(900),
  ringMax: toFp(1400),
  /**
   * Mob health on wave w: hp + (hpStep * n + hpSquare * n^2) / 1000 with n = w - 1, steeper
   * late so a finished build still meets a threat (the sandbox horde dies in one hit).
   */
  hp: 10,
  hpStep: 300,
  hpSquare: 30,
};

export type MobKind = 'chaser' | 'runner' | 'swarm' | 'emerger' | 'shooter';

/**
 * Kinds of horde mob (docs/content.md "Enemies"): how fast each walks and its share of the
 * wave's mob health. A swarm mob falls to any hit whatever the wave.
 */
export const MOB_KINDS: Record<MobKind, { speed: number; hpPercent: number }> = {
  chaser: { speed: HORDE.speed, hpPercent: 100 },
  runner: { speed: perTick(185), hpPercent: 60 },
  swarm: { speed: perTick(150), hpPercent: 0 },
  emerger: { speed: HORDE.speed, hpPercent: 100 },
  shooter: { speed: perTick(95), hpPercent: 80 },
};

/**
 * Who joins each chapter's horde (docs/content.md "Chapters"): from wave `from`, newcomer n
 * with n % every === every - 1 is of `kind` (the first rule that matches wins), the rest are
 * chasers. Chapter 1 has fox runners; chapter 2 water ghosts that rise next to the hero and
 * toads that shoot. Later chapters play the last list until they get their own.
 */
export const CHAPTER_MOBS: readonly (readonly { kind: MobKind; from: number; every: number }[])[] = [
  [{ kind: 'runner', from: 3, every: 4 }],
  [{ kind: 'shooter', from: 3, every: 8 }, { kind: 'emerger', from: 2, every: 5 }],
];

/**
 * The emerger (systems/marsh.ts): a fallen one waits under the ground for under..under+underSpread,
 * then marks a spot between near and far from the hero for `warn` and rises there, hurting a
 * hero within grab of it; then it walks like a chaser.
 */
export const EMERGE = {
  under: ticks(2),
  underSpread: ticks(3),
  warn: ticks(1),
  near: toFp(180),
  far: toFp(340),
  grab: toFp(80),
};

/**
 * The shooter (systems/marsh.ts): it stops stopDist from the hero; every cooldown..cooldown+spread
 * it swells for `windup`, then fires a fan of THREATS.fan bullets at him, if he is within range.
 */
export const SHOOTER = {
  stopDist: toFp(460),
  range: toFp(720),
  cooldown: ticks(5),
  spread: ticks(2),
  windup: ticks(0.5),
};

/**
 * Swarm waves (swarmFrom, then every swarmEvery) bring a bunched pack of swarm mobs on top of
 * the horde, up to swarmMax of them in all.
 */
export const MIX = {
  swarmFrom: 6,
  swarmEvery: 4,
  swarmPack: 10,
  swarmMax: 40,
  swarmSpread: toFp(110),
  /** Share of fallen swarm mobs that leave a gem, so the packs do not flood the run with levels. */
  swarmGemPercent: 25,
};

/** The elite kinds: the big jiangshi charges, the toad king spits fans and poison pools. */
export type EliteKind = 'charger' | 'toadKing';

/** Each chapter's elite; later chapters play the last one until they get their own. */
export const CHAPTER_ELITES: readonly EliteKind[] = ['charger', 'toadKing'];

/**
 * The toad king (systems/marsh.ts): it stops stopDist from the hero; with him within range and
 * its cooldown done it swells for `windup`, then in turn spits a fan of `fan` bullets at him or
 * marks `pools` poison pools (THREATS zones of poolRadius: one on him, the rest within
 * poolSpread of him) that go off after THREATS.warn, and sits for `rest`. Hits barely push it
 * (knockback), so it stays within the hero's kick range.
 */
export const TOAD_KING = {
  speed: perTick(120),
  stopDist: toFp(380),
  knockback: toFp(30),
  range: toFp(800),
  hp: 400,
  windup: ticks(0.8),
  rest: ticks(0.6),
  cooldown: ticks(2),
  fan: 5,
  pools: 3,
  poolRadius: toFp(140),
  poolSpread: toFp(300),
};

export const ELITE = {
  speed: perTick(160),
  stopDist: toFp(220),
  knockback: toFp(160),
  hp: 400,
  /** Experience in the gem it leaves. */
  gem: 20,
  /**
   * The charge (systems/elite.ts): with a hero within chargeRange and its cooldown done, the
   * elite stops and marks a lane at him for `aim`, dashes dashLength along it, hurting a hero
   * within laneHalf of its path, then stands for `rest`.
   */
  chargeRange: toFp(750),
  aim: ticks(0.8),
  dashSpeed: perTick(1400),
  dashLength: toFp(1050),
  laneHalf: toFp(80),
  rest: ticks(0.7),
  cooldown: ticks(2.5),
};

export const WAVES = {
  ticks: ticks(15),
  /** Horde size on wave w: min(max, base + step * (w - 1)). */
  hordeBase: 12,
  hordeStep: 3,
  hordeMax: 160,
  /** Every this many waves an elite comes (not on boss waves). */
  eliteEvery: 10,
  /** The mid-boss wave; the last wave always has the chapter boss. Boss waves last until it falls. */
  midBoss: 25,
  /**
   * The mid-boss is the elite's twins (docs/content.md): two big jiangshi from opposite sides,
   * each with twinHp; the second's first charge waits twinDelay longer, and they take turns.
   */
  twinHp: 650,
  twinDelay: ticks(1.5),
};

/**
 * Shrines (docs/content.md "Shrines"): on waves first, first + every, ... before the last, the
 * horde pauses and each hero picks one of heal, insight (a free level-up pick) or offering
 * (a bet on more copper, won by reaching the next shrine or the end alive).
 */
export const SHRINE = {
  first: 5,
  every: 10,
  healPercent: 50,
};

export const BALL = {
  speed: perTick(1300),
  hitRadius: toFp(55),
  seekRange: toFp(600),
  maxTravel: toFp(900),
};

export const DAMAGE = {
  /** Base damage is min..max, a crit triples it. */
  min: 8,
  max: 15,
  critPercent: 20,
  critMul: 3,
};

export const BOSS = {
  speed: perTick(95),
  stopDist: toFp(150),
  slamRange: toFp(420),
  slamReach: toFp(200),
  slamRadius: toFp(260),
  /** Wind-up to impact matches boss_tao.json "slam". */
  windup: ticks(1.0),
  recover: ticks(0.6),
  cooldown: ticks(2.5),
  hp: 3000,
  respawnAfter: ticks(3),
  respawnDist: toFp(1000),
};

export const THREATS = {
  volleyEvery: ticks(1 / 1.5),
  fan: 3,
  fanStep: degToBrad(12.6),
  bulletSpeed: perTick(380),
  bulletLife: ticks(4),
  hitRadius: toFp(40),
  range: toFp(900),
  zoneEvery: ticks(1 / 0.7),
  zoneRadius: toFp(170),
  warn: ticks(1.2),
  zoneSpread: toFp(350),
  /** Random mobs tried as the shooter before a volley is skipped. */
  picks: 8,
};

export const DROPS = {
  cell: toFp(80),
  max: 400,
  magnet: toFp(230),
  pickup: toFp(45),
  /** Values at which a gem grows to the next look. */
  tiers: [10, 50],
  /** A flying gem first hops away from the hero, then accelerates past his top speed. */
  hop: perTick(380),
  accel: Math.round((4200 * FP) / (TICK_RATE * TICK_RATE)),
  maxSpeed: perTick(2000),
  /** Share of the velocity turned toward the hero per tick, per mille. */
  turn: 333,
};
export const OVERFLOW_TIER = DROPS.tiers.length + 1;

export const SPELLS = {
  novaRadius: toFp(700),
  meteors: 5,
  meteorRadius: toFp(220),
  meteorSpread: toFp(500),
  fieldRadius: toFp(380),
  fieldSpread: toFp(300),
  fieldLife: ticks(3),
  chainJumps: 8,
  chainRange: toFp(350),
};
