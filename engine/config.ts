import { perTick, ticks, toFp } from './math/fixed';
import { degToBrad } from './math/trig';

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
}

export const DEFAULT_RUN: RunConfig = {
  seed: 1, players: 1, mobs: 40, sep: 75, queue: true, heroEase: 379, elite: true, boss: true,
  threats: false, spells: [], spellRate: 1, drops: 0,
};

/** The smooth hero ease, 1 - exp(-tick / 0.07 s), as a constant so no exp runs in the sim. */
export const HERO_EASE_SMOOTH = 379;
export const HERO_EASE_LOCKED = 1000;

export const HERO = {
  speed: perTick(420),
  kickRange: toFp(650),
  /** A kick that connects looks a little further, so a target stepping back is still hit. */
  strikeRange: toFp(845),
  kickCooldown: ticks(0.9),
  /** Ticks from the start of the kick to the foot meeting the ball (hero_tao.json "kick"). */
  strikeAt: ticks(0.18),
  kickTicks: ticks(0.4),
  hurtTicks: ticks(0.35),
  hurtDist: toFp(85),
  hurtCooldown: ticks(1),
  footOffset: toFp(40),
  /** Above this stick magnitude (of 255) the hero counts as moving. */
  moveMag: 26,
};

export const HORDE = {
  speed: perTick(110),
  stopDist: toFp(70),
  respawnDist: toFp(2200),
  ringMin: toFp(900),
  ringMax: toFp(1400),
};

export const ELITE = {
  speed: perTick(160),
  stopDist: toFp(220),
  knockback: toFp(160),
};

export const BALL = {
  speed: perTick(1300),
  hitRadius: toFp(55),
  seekRange: toFp(600),
  maxHits: 3,
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
  hp: 1500,
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
  accel: Math.round((4200 * 100) / (30 * 30)),
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
  fieldTick: ticks(0.5),
  chainJumps: 8,
  chainRange: toFp(350),
};
