import { FP, perTick, TICK_RATE, ticks, toFp } from './math/fixed';
import { degToBrad } from './math/trig';
import type { MonkId, RelicId, StatBonus, SutraId } from './content';

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
  /** The monk every hero plays the run as (MONK_STATS, MONK_PASSIVE). */
  monk: MonkId;
  /** Sutras the player has: their spells and passives join the level-up pool. */
  sutras: readonly SutraId[];
  /** The chapter played (1-based): which kinds of mob join the horde (CHAPTER_MOBS). */
  chapter: number;
  /** Stats from gear and training, the same for every hero (whole numbers, passive units). */
  bonus: StatBonus;
  /** Hard mode (HARD): the chapter's waves for heroes with endgame gear. */
  hard: boolean;
}

export const DEFAULT_RUN: RunConfig = {
  seed: 1, players: 1, mobs: 40, sep: 75, queue: true, heroEase: 379, elite: true, boss: true,
  threats: false, spells: [], spellRate: 1, drops: 0, waves: 0, revives: 1, relic: 'ball', monk: 'kicker', sutras: [], chapter: 1, bonus: {}, hard: false,
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

/**
 * The monks' passives (systems/monks.ts). Fat monk, Belly Bounce: every blow he takes bounces
 * the enemies within `radius` back by `knockback` and hits them for `damage` percent. Novice,
 * Light Feet: while he runs, every `dodgeEvery`th blow misses him.
 */
export const MONK_PASSIVE = {
  radius: toFp(300),
  knockback: toFp(240),
  damage: 150,
  dodgeEvery: 3,
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
  /** The Black Carp King surfacing under the hero. */
  surface: 25,
  /** An ice wraith's frost circle going off. */
  frost: 12,
  /** The door god's halberd coming down. */
  smash: 20,
  /** A zone of the Underworld Judge's verdict going off. */
  verdict: 14,
  /** The Inner Demon's dark spell (a zone going off) and its landing after a staff leap. */
  demonSpell: 14,
  demonLeap: 20,
  /** Every hurt by chapter, percent (later chapters play the last), so health from gear does not make them safe. */
  chapterPercent: [100, 100, 125, 210, 250],
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
  /**
   * Mob health by chapter, percent (later chapters play the last): the hero comes in with
   * gear and training (RunConfig.bonus), and the meta game's pacing (`npm run journey`,
   * docs/design.md "Pacing targets") asks a few days of farming for each later chapter.
   */
  chapterHp: [100, 140, 440, 3000, 7000],
};

/**
 * A later chapter's extra mob health and hurt (over 100 %, HORDE.chapterHp and
 * HURT.chapterPercent) come in over the run: `from` percent of the extra on wave 1, rising to
 * `to` percent on wave `wave` and after. The hero starts every run at level 1, so a flat step
 * makes the first waves the wall and the rest of the run a formality.
 */
export const CHAPTER_RAMP = {
  from: 0,
  to: 180,
  wave: 50,
};

/**
 * Hard mode (docs/design.md "Hard mode"), open once chapter 5 is cleared: the same chapters for
 * a hero with endgame gear. Mob health and every hurt take these percents by chapter in place of
 * HORDE.chapterHp and HURT.chapterPercent (ramped in the same way, CHAPTER_RAMP), elites and
 * bosses have foeHp percent of their health, and every elite wave brings one elite more.
 */
export const HARD = {
  hp: [16000, 21000, 26000, 32000, 40000],
  hurt: [300, 320, 340, 360, 380],
  foeHp: [350, 380, 400, 420, 450],
};

/** `pct` percent (a chapter's HORDE.chapterHp or HURT.chapterPercent) ramped in for wave `wave` (CHAPTER_RAMP). */
export function rampChapter(pct: number, wave: number): number {
  const span = CHAPTER_RAMP.wave - 1;
  const n = Math.min(Math.max(wave - 1, 0), span);
  const share = CHAPTER_RAMP.from + Math.trunc(((CHAPTER_RAMP.to - CHAPTER_RAMP.from) * n) / span);
  return 100 + Math.trunc(((pct - 100) * share) / 100);
}

export type MobKind = 'chaser' | 'runner' | 'swarm' | 'emerger' | 'shooter' | 'wolf' | 'caster' | 'skeleton' | 'shard' | 'effigy' | 'scrap' | 'monk';

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
  wolf: { speed: perTick(215), hpPercent: 70 },
  caster: { speed: perTick(90), hpPercent: 90 },
  skeleton: { speed: perTick(120), hpPercent: 100 },
  shard: { speed: perTick(160), hpPercent: 35 },
  effigy: { speed: perTick(115), hpPercent: 90 },
  scrap: { speed: perTick(170), hpPercent: 30 },
  monk: { speed: perTick(100), hpPercent: 120 },
};

/**
 * Mobs that come and go outside the horde's count: swarm and wolf packs (they still come back
 * on the ring when they fall), and the Bone Witch's skeletons and their shards and the paper
 * effigies' scraps, which do not: fallen, they lie under the ground (health 0) until called
 * up again.
 */
export function extraKind(kind: MobKind): boolean {
  return kind === 'swarm' || kind === 'wolf' || tempKind(kind);
}

/** Mobs that fall for good (lying under the ground until called up again), see extraKind. */
export function tempKind(kind: MobKind): boolean {
  return kind === 'skeleton' || kind === 'shard' || kind === 'scrap';
}

/**
 * Who joins each chapter's horde (docs/content.md "Chapters"): from wave `from`, newcomer n
 * with n % every === every - 1 is of `kind` (the first rule that matches wins), the rest are
 * chasers. Chapter 1 has fox runners; chapter 2 water ghosts that rise next to the hero and
 * toads that shoot; chapter 3 ice wraiths that mark frost circles (its wolves come in packs,
 * CHAPTER_PACKS); chapter 4 lantern ghosts that shoot, long-tongue ghosts that rise next to the
 * hero and paper effigies that tear into scraps; chapter 5 fallen monks behind their gongs (shielders)
 * and shadows (runners) among every earlier kind. Later chapters play the last list until they
 * get their own.
 */
export const CHAPTER_MOBS: readonly (readonly { kind: MobKind; from: number; every: number }[])[] = [
  [{ kind: 'runner', from: 3, every: 4 }],
  [{ kind: 'shooter', from: 3, every: 10 }, { kind: 'emerger', from: 2, every: 5 }],
  [{ kind: 'caster', from: 3, every: 6 }],
  [{ kind: 'shooter', from: 3, every: 9 }, { kind: 'emerger', from: 2, every: 6 }, { kind: 'effigy', from: 2, every: 3 }],
  [
    { kind: 'monk', from: 2, every: 5 }, { kind: 'runner', from: 2, every: 4 }, { kind: 'shooter', from: 4, every: 11 },
    { kind: 'caster', from: 5, every: 9 }, { kind: 'effigy', from: 3, every: 7 }, { kind: 'emerger', from: 2, every: 6 },
  ],
];

/**
 * Pack waves (from, then every `every`) bring a bunched pack of `size` mobs of `kind` on top of
 * the horde, up to `max` of that kind in all: ghost wisps in chapters 1, 2 and 4, snow wolves in 3 and 5.
 */
export interface Pack {
  kind: MobKind;
  from: number;
  every: number;
  size: number;
  max: number;
  spread: number;
}

const WISPS: Pack = { kind: 'swarm', from: 6, every: 4, size: 10, max: 40, spread: toFp(110) };

/** Each chapter's packs; later chapters play the last one until they get their own. */
export const CHAPTER_PACKS: readonly Pack[] = [
  WISPS,
  WISPS,
  { kind: 'wolf', from: 3, every: 3, size: 6, max: 36, spread: toFp(160) },
  WISPS,
  { kind: 'wolf', from: 4, every: 3, size: 6, max: 30, spread: toFp(160) },
];

export const MIX = {
  /** Share of fallen swarm mobs, shards and scraps that leave a gem, so they do not flood the run with levels. */
  swarmGemPercent: 25,
};

/**
 * The elite kinds: the big jiangshi charges, the toad king spits fans and poison pools, the
 * wolf leader charges and howls, the door god shields itself and smashes.
 */
export type EliteKind = 'charger' | 'toadKing' | 'wolfLeader' | 'doorGod';

/**
 * Each chapter's elite; later chapters play the last one until they get their own. Chapter 5
 * has none of its own: its elite waves bring two earlier ones at once (ELITE_PAIRS).
 */
export const CHAPTER_ELITES: readonly EliteKind[] = ['charger', 'toadKing', 'wolfLeader', 'doorGod', 'doorGod'];

/**
 * The boss kinds: the Fallen Abbot slams, the Black Carp King dives and surfaces, the Bone
 * Witch summons skeletons and throws bone fans, the Underworld Judge writes lines of zones, the
 * Inner Demon turns the hero's own relic against him.
 */
export type BossKind = 'abbot' | 'carp' | 'witch' | 'judge' | 'demon';

/**
 * Each chapter's boss (the last wave); later chapters play the last one until they get their
 * own. From chapter 2 on, the mid-boss is the previous chapter's boss, empowered.
 */
export const CHAPTER_BOSSES: readonly BossKind[] = ['abbot', 'carp', 'witch', 'judge', 'demon'];

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
  /**
   * A boss fight thins the horde: while the mid-boss or the boss stands, a mob that falls stays
   * down as long as the standing horde is above this percent of the wave's size, so the relic
   * can reach the boss through it; the next wave brings them back.
   */
  bossHordePercent: 40,
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
  /**
   * The relic locks onto the boss or an elite this far away, and the ball flies at it through
   * the horde (the relic is the weapon against the big ones; spells clear the horde).
   */
  lockRange: toFp(1100),
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

export * from './foes';
