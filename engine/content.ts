import { perTick, ticks, toFp } from './math/fixed';

// The in-run build (docs/content.md "Build in a run"): the relic's levels, the spells and the
// passives a level-up card can offer, and the experience curve. Table rows are levels
// (index 0 is level 1). Percentages are whole numbers; times are ticks.

export const MAX_LEVEL = 5;
export const MAX_SPELLS = 4;
export const MAX_PASSIVES = 4;
export const OFFER_SIZE = 3;

/**
 * Experience from level L to L + 1: first + step * (L - 1) + square * (L - 1)^2, and from the
 * second on at least `least`. The square keeps pace with the horde, which grows and dies faster as the build
 * grows, for about 30 level-ups in a full chapter. The first comes quick; the floor spaces the
 * next few out, so the first minute is not a card every five seconds.
 */
export const LEVELING = { first: 5, step: 0, square: 1, least: 10 };

export function xpToNext(level: number): number {
  const l = level - 1;
  const xp = LEVELING.first + LEVELING.step * l + LEVELING.square * l * l;
  return l > 0 ? Math.max(LEVELING.least, xp) : xp;
}

/** The relic a run is played with (docs/content.md "Relics"), chosen in the lobby. */
export type RelicId = 'ball' | 'staff' | 'fish' | 'beads' | 'bowl';
export const RELIC_IDS: readonly RelicId[] = ['ball', 'staff', 'fish', 'beads', 'bowl'];

/** The cuju ball (the starter relic): bounces per kick, damage percent, kick cooldown. */
export interface RelicLevel {
  hits: number;
  damage: number;
  cooldown: number;
}

export const RELIC_LEVELS: readonly RelicLevel[] = [
  { hits: 3, damage: 100, cooldown: ticks(0.9) },
  { hits: 4, damage: 100, cooldown: ticks(0.9) },
  { hits: 4, damage: 140, cooldown: ticks(0.9) },
  { hits: 4, damage: 140, cooldown: ticks(0.7) },
  { hits: 5, damage: 180, cooldown: ticks(0.7) },
];

/**
 * The staff: a close sweep over a half circle toward the target (a full circle awakened),
 * hitting everything inside `reach` at `damage` percent and knocking mobs back `knockback`.
 */
export interface StaffLevel {
  damage: number;
  cooldown: number;
  reach: number;
  knockback: number;
}

function st(damage: number, cooldown: number, reach: number, knockback: number): StaffLevel {
  return { damage, cooldown: ticks(cooldown), reach: toFp(reach), knockback: toFp(knockback) };
}

export const STAFF_LEVELS: readonly StaffLevel[] = [
  st(220, 0.8, 270, 90), st(220, 0.8, 300, 90), st(300, 0.8, 300, 110), st(300, 0.65, 320, 110), st(400, 0.65, 340, 130),
];

/** Ruyi Staff: the sweep goes all the way round and reaches further. */
export const STAFF_AWAKENED: StaffLevel = st(400, 0.65, 440, 150);

export const STAFF = {
  /** The swing starts when a target is this much further than the reach (it is still closing in). */
  startPercent: 115,
};

/**
 * The wooden fish: every tap sends a sound ring out from the hero to `reach`, hitting each
 * enemy it passes once at `damage` percent.
 */
export interface FishLevel {
  damage: number;
  cooldown: number;
  reach: number;
}

function fl(damage: number, cooldown: number, reach: number): FishLevel {
  return { damage, cooldown: ticks(cooldown), reach: toFp(reach) };
}

export const FISH_LEVELS: readonly FishLevel[] = [
  fl(150, 1.1, 360), fl(150, 1.1, 400), fl(200, 1.1, 400), fl(200, 0.9, 430), fl(280, 0.9, 460),
];

/** Stunning Bell: a wider ring, and every `stunEvery`th one stuns what it passes (FISH). */
export const FISH_AWAKENED: FishLevel = fl(280, 0.9, 520);

export const FISH = {
  /** The hero taps when a target is this close (a share of the reach): the ring has to reach it. */
  startPercent: 90,
  ringSpeed: perTick(1500),
  /** Stunning Bell: every this many rings stun mobs and the elite (not the boss) this long. */
  stunEvery: 4,
  stun: ticks(1),
};

/**
 * Prayer beads: `count` beads circle the hero at `orbit`, one turn every `turn`, and hit each
 * enemy they touch once per pass at `damage` percent.
 */
export interface BeadsRing {
  count: number;
  damage: number;
  turn: number;
  orbit: number;
}

function br(count: number, damage: number, turn: number, orbit = 150): BeadsRing {
  return { count, damage, turn: ticks(turn), orbit: toFp(orbit) };
}

export const BEADS_LEVELS: readonly BeadsRing[] = [
  br(3, 70, 1.6), br(4, 70, 1.6), br(4, 90, 1.4), br(5, 90, 1.4), br(6, 120, 1.2),
];

/** 108 Beads: a ring inside and one outside, the outer turning the other way. */
export const BEADS_AWAKENED: readonly BeadsRing[] = [br(6, 120, 1.2, 115), br(6, 120, 1.2, 250)];

export const BEADS = {
  /** A bead touches what is this close to it (the horde stands at 70 from the hero, inside it). */
  radius: toFp(85),
};

/**
 * The alms bowl: thrown at a target in `reach`, it flies that far and comes back to the hero,
 * hitting each enemy it passes once each way at `damage` percent; on the way out it drags up to
 * `carry` mobs along and leaves them at the far end.
 */
export interface BowlLevel {
  damage: number;
  cooldown: number;
  reach: number;
  carry: number;
}

function bw(damage: number, cooldown: number, reach: number, carry: number): BowlLevel {
  return { damage, cooldown: ticks(cooldown), reach: toFp(reach), carry };
}

export const BOWL_LEVELS: readonly BowlLevel[] = [
  bw(150, 1, 480, 3), bw(150, 1, 520, 4), bw(200, 1, 520, 4), bw(200, 0.85, 560, 5), bw(280, 0.85, 600, 6),
];

/** Bottomless Bowl: up to `carry` mobs it touches are swallowed, their experience given at once. */
export const BOWL_AWAKENED: BowlLevel = bw(280, 0.85, 640, 8);

export const BOWL = {
  speed: perTick(1400),
  /** The bowl touches what is this close to it. */
  radius: toFp(80),
  /** A carried mob further than this from the bowl was knocked away (it respawned): let go. */
  hold: toFp(200),
  /** The bowl is caught when it comes this close to the hero. */
  catch: toFp(60),
};

export type SpellId = 'palm' | 'bolt' | 'incense' | 'bell' | 'cymbal' | 'lotus' | 'halo' | 'roar' | 'talisman' | 'bomb' | 'knives';
export const SPELL_IDS: readonly SpellId[] = ['palm', 'bolt', 'incense', 'bell', 'cymbal', 'lotus', 'halo', 'roar', 'talisman', 'bomb', 'knives'];

/**
 * One spell level. `count` is palms (palm), jumps (bolt), cymbals (cymbal) or beams (halo); `radius` the blast, jump range, ring, bell blast,
 * cymbal hit radius, lotus bloom, beam length or roar reach; `life` how long the incense ring
 * burns, a cymbal flies or a lotus seed waits, or the halo's time for one turn (0 for the
 * others). The bell's cooldown is its recharge after it breaks; the lotus' is the time
 * between two seeds while walking; the halo has none (it always turns).
 */
export interface SpellLevel {
  cooldown: number;
  count: number;
  radius: number;
  life: number;
  damage: number;
}

function lv(cooldown: number, count: number, radius: number, life: number, damage: number): SpellLevel {
  return { cooldown: ticks(cooldown), count, radius: toFp(radius), life: ticks(life), damage };
}

export const SPELL_LEVELS: Readonly<Record<SpellId, readonly SpellLevel[]>> = {
  // a giant palm slams the densest group in reach (cast shape 'meteor')
  palm: [lv(3, 1, 240, 0, 100), lv(3, 2, 240, 0, 100), lv(2.5, 2, 280, 0, 100), lv(2.5, 3, 280, 0, 100), lv(2, 3, 320, 0, 150)],
  // lightning from the hero through `count` targets (cast shape 'chain')
  bolt: [lv(2.4, 5, 350, 0, 100), lv(2.4, 6, 350, 0, 100), lv(2, 7, 350, 0, 100), lv(2, 8, 350, 0, 130), lv(1.6, 10, 350, 0, 130)],
  // a burning ring left at the hero's feet (cast shape 'field')
  incense: [lv(4, 0, 300, 3, 80), lv(4, 0, 340, 3, 80), lv(3.4, 0, 340, 3.5, 80), lv(3.4, 0, 380, 3.5, 80), lv(2.8, 0, 380, 4, 120)],
  // a golden dome that takes one blow for the hero, then breaks in a blast (cast shape 'nova')
  bell: [lv(8, 0, 300, 0, 150), lv(7, 0, 320, 0, 150), lv(7, 0, 360, 0, 200), lv(6, 0, 360, 0, 200), lv(5, 0, 420, 0, 250)],
  // cymbals thrown one after another at the nearest enemies, piercing, ricocheting off the one aimed at
  cymbal: [lv(2.4, 2, 70, 1.2, 80), lv(2.4, 3, 70, 1.2, 80), lv(2, 3, 85, 1.2, 80), lv(2, 4, 85, 1.2, 100), lv(1.6, 4, 100, 1.2, 100)],
  // walking drops lotus seeds that bloom when an enemy steps on one, or at their time with one near (sutra)
  lotus: [lv(0.6, 0, 180, 2.5, 220), lv(0.5, 0, 180, 2.5, 220), lv(0.5, 0, 210, 2.5, 270), lv(0.4, 0, 210, 3, 270), lv(0.35, 0, 240, 3, 330)],
  // a beam turning around the hero, longer while he stands still (sutra)
  halo: [lv(0, 1, 360, 1.6, 200), lv(0, 1, 400, 1.6, 200), lv(0, 1, 400, 1.4, 240), lv(0, 1, 450, 1.4, 240), lv(0, 1, 500, 1.1, 300)],
  // a cone shout at the nearest enemy, pushing the horde back (sutra)
  roar: [lv(2, 0, 380, 0, 150), lv(2, 0, 420, 0, 150), lv(1.8, 0, 420, 0, 200), lv(1.8, 0, 470, 0, 200), lv(1.5, 0, 520, 0, 250)],
  // `count` talismans fan out, then each homes on a different enemy and strikes once (radius: hit, life: flight)
  talisman: [lv(2, 3, 70, 2, 140), lv(2, 4, 70, 2, 140), lv(1.7, 5, 70, 2, 140), lv(1.7, 6, 70, 2, 180), lv(1.4, 8, 70, 2, 180)],
  // a bomb lobbed at the nearest enemy: a blast that pushes the mobs back, then `count` bomblets in a star
  bomb: [lv(1.5, 2, 220, 0, 130), lv(1.5, 3, 220, 0, 130), lv(1.3, 3, 250, 0, 130), lv(1.3, 4, 250, 0, 170), lv(1.1, 5, 280, 0, 170)],
  // a knife joins the circle around the hero every cooldown, up to `count`; the full circle volleys out (radius: hit)
  knives: [lv(0.5, 3, 55, 0, 60), lv(0.45, 4, 55, 0, 60), lv(0.4, 5, 60, 0, 70), lv(0.35, 6, 60, 0, 80), lv(0.3, 8, 65, 0, 90)],
};

/**
 * A new player's first level-ups show something on screen: the first `deals` offers are only
 * these attack spells (the ones not yet owned), never a stat card.
 */
export const OPENING_DEAL = { deals: 2, spells: ['cymbal', 'bolt', 'palm', 'incense', 'talisman', 'bomb', 'knives'] as readonly SpellId[] };

/**
 * A new player's first run (RunConfig.firstRun) deals these spells, in this order, first in its
 * * first level-ups, so a hero who hardly moves yet already throws, circles and homes in, and then
 * heals behind the incense.
 */
export const FIRST_RUN_SPELLS: readonly SpellId[] = ['bomb', 'knives', 'talisman', 'incense'];

/**
 * Spells and passives that start out of the level-up pool: each comes with a sutra
 * (docs/design.md "Content line"), granted by an achievement and handed to the run in
 * RunConfig.sutras.
 */
/**
 * The monk a run is played as (docs/content.md "Monks"), chosen in the lobby: his stats sit
 * with the gear's at the bottom of the stat stack, and the fat monk and the novice each have a
 * passive of their own (MONK_PASSIVE, systems/monks.ts).
 */
export type MonkId = 'kicker' | 'fat' | 'novice';
export const MONK_IDS: readonly MonkId[] = ['kicker', 'fat', 'novice'];

export const MONK_STATS: Readonly<Record<MonkId, StatBonus>> = {
  kicker: {},
  fat: { maxHp: 50, speed: -15 },
  novice: { maxHp: -30, speed: 20, xp: 15 },
};

export type SutraId = 'lotus' | 'halo' | 'roar' | 'focus';
export const SUTRA_IDS: readonly SutraId[] = ['lotus', 'halo', 'roar', 'focus'];

export const LOTUS = {
  /** A seed is armed this long after it was dropped (the mobs at the hero's heels pass first). */
  arm: ticks(0.4),
  /** An armed seed blooms when an enemy (or a petal, with an enemy in its bloom) comes this close to it. */
  trigger: toFp(130),
  /** A bloom shoots `petals` out at `petalPercent` of its damage; Lotus Path's home in on the horde. */
  petals: 5,
  petalSpeed: perTick(900),
  petalLife: ticks(0.5),
  petalRadius: toFp(45),
  petalPercent: 40,
  petalTurn: 2000,
  /** Lotus Path: a bloom sends the gems this close to it flying to the hero. */
  pull: toFp(450),
};

export const HALO = {
  /** While the hero moves the beam is this share of its length. */
  movingPercent: 70,
  /** The beam's own sweep deals this share of the spell's damage; the needles the rest. */
  beamPercent: 50,
  /** A needle leaves along each beam every `needleEvery` (with several beams every other time), flying `needleReach` percent of the beam's length. */
  needleEvery: ticks(0.12),
  needleSpeed: perTick(1500),
  needleReach: 180,
  needleRadius: toFp(40),
  needlePercent: 60,
};

export const ROAR = {
  /** Half the cone's opening, brads (60 degrees). */
  half: 10923,
  /** Mobs that survive are pushed this far away from the hero. */
  knockback: toFp(220),
};

export const SPELL_CAST = {
  /** The palm only looks for crowds this close to the hero. */
  palmReach: toFp(800),
  /** Mobs sampled as the centre of a palm; the one with most neighbours wins. */
  palmPicks: 8,
  /** A palm lands this long after it is cast (its shadow warns the crowd), each next one of a cast a little later. */
  palmFall: ticks(0.3),
  palmStagger: ticks(0.1),
  fieldTick: ticks(0.5),
  /** A spell that found nothing to hit tries again after this long. */
  retry: ticks(0.3),
  /** A newly learned spell first casts after this long. */
  first: ticks(0.5),
  /** Spells deal this share of their damage to the elite and the boss (content.md roles). */
  bigPercent: 50,
  /** After the bell breaks the hero is untouchable this long (the blow it took). */
  bellGuard: ticks(0.5),
  /** Cymbals are only thrown with an enemy this close to aim at. */
  cymbalReach: toFp(1100),
  cymbalSpeed: perTick(1500),
  /** A throw's cymbals leave one after another; one that strikes its target ricochets to the nearest new one this close. */
  cymbalStagger: ticks(0.12),
  cymbalBounces: 2,
  cymbalBounceReach: toFp(500),
};

/** Demon-Binding Talismans (systems/talismans.ts). */
export const TALISMAN = {
  /** Only cast with an enemy this close; each talisman picks a different one in reach. */
  reach: toFp(1200),
  /** They fan out slowly for `spread`, then fly at `speed` turning at most `turn` brads a tick. */
  spread: ticks(0.25),
  fanSpeed: perTick(700),
  speed: perTick(1300),
  turn: 2600,
};

/** Thunder Fire, the cluster bomb (systems/bombs.ts). */
export const BOMB = {
  reach: toFp(900),
  /** The bomb's flight, then each bomblet's. */
  flight: ticks(0.5),
  bombletFlight: ticks(0.3),
  /** Bomblets land this far from the blast, with this share of its radius and damage. */
  scatter: toFp(230),
  bombletRadiusPercent: 55,
  bombletDamagePercent: 60,
  /** Mobs that survive the big blast are pushed this far from its centre. */
  knockback: toFp(160),
};

/** Blade Circle (systems/knives.ts). */
export const KNIVES = {
  orbit: toFp(210),
  /** One turn of the circle. */
  turn: ticks(0.8),
  /** A circling knife hits a target again after this long. */
  rehit: ticks(0.4),
  /** The full circle volleys at the enemies this close, each knife piercing for `life`. */
  reach: toFp(1000),
  speed: perTick(1800),
  life: ticks(0.6),
};

export type Stat = 'cooldown' | 'maxHp' | 'speed' | 'area' | 'regen' | 'crit' | 'xp' | 'magnet' | 'duration' | 'guard' | 'attack';
export const STATS: readonly Stat[] = ['cooldown', 'maxHp', 'speed', 'area', 'regen', 'crit', 'xp', 'magnet', 'duration', 'guard', 'attack'];

/**
 * Stats the hero brings into a run from outside it (gear and training, docs/design.md "Meta
 * progression"), in the passives' units; they sit at the bottom of the stat stack. `attack`
 * only comes from here: it grows every hit by percent.
 */
export type StatBonus = Readonly<Partial<Record<Stat, number>>>;
export type PassiveId = 'calm' | 'iron' | 'legs' | 'eye' | 'rice' | 'wrath' | 'karma' | 'focus';
export const PASSIVE_IDS: readonly PassiveId[] = ['calm', 'iron', 'legs', 'eye', 'rice', 'wrath', 'karma', 'focus'];

export interface PassiveDef {
  stat: Stat;
  perLevel: number;
  /** A second stat the passive raises (Karma). */
  also?: { stat: Stat; perLevel: number };
}

/**
 * Each passive adds `perLevel` to one stat per level (Karma and Focus to two). Units: percent, except
 * `regen` (per mille of max health per second).
 */
export const PASSIVES: Readonly<Record<PassiveId, PassiveDef>> = {
  calm: { stat: 'cooldown', perLevel: 8 },
  iron: { stat: 'maxHp', perLevel: 15 },
  legs: { stat: 'speed', perLevel: 8 },
  eye: { stat: 'area', perLevel: 10 },
  rice: { stat: 'regen', perLevel: 4 },
  wrath: { stat: 'crit', perLevel: 5 },
  // experience and the gem magnet's radius
  karma: { stat: 'xp', perLevel: 8, also: { stat: 'magnet', perLevel: 15 } },
  // how long spells last (seeds, rings, prints, cymbal flights) and the untouchable time after a blow
  focus: { stat: 'duration', perLevel: 10, also: { stat: 'guard', perLevel: 20 } },
};

/**
 * Evolutions (docs/content.md): a spell at MAX_LEVEL plus its paired passive at any level
 * puts the evolved form on the next level-up as a guaranteed card; the relic awakens the same
 * way. The evolved row replaces the level-5 row.
 */
export const EVOLVE_PAIR: Readonly<Record<SpellId | RelicId, PassiveId>> = {
  ball: 'legs', staff: 'iron', fish: 'calm', beads: 'eye', bowl: 'karma', palm: 'eye', bolt: 'wrath', incense: 'rice', bell: 'iron', cymbal: 'legs',
  lotus: 'karma', halo: 'calm', roar: 'focus', talisman: 'calm', bomb: 'eye', knives: 'wrath',
};

/** The awakened cuju (Meteor Ball): every bounce also sends two splinters at other targets. */
export const RELIC_AWAKENED: RelicLevel = { hits: 5, damage: 180, cooldown: ticks(0.7) };

export const SPELL_EVOLVED: Readonly<Record<SpellId, SpellLevel>> = {
  // Mountain Palm: radius is the blast and the pinning print left behind
  palm: lv(2, 3, 320, 2, 150),
  // Endless Chain: every jump also forks to the nearest other enemy
  bolt: lv(1.6, 10, 350, 0, 130),
  // Healing Incense: the hero heals while standing in the ring
  incense: lv(2.8, 0, 380, 4, 120),
  // Golden Body: a bigger blast, then EVOLVE.bellGuard of immunity
  bell: lv(5, 0, 520, 0, 250),
  // Cymbal Wheel: `count` cymbals circle the hero for good, `radius` each, and fling one more every cast
  cymbal: lv(0.5, 4, 100, 0, 100),
  // Lotus Path: a seed at almost every step, and every bloom pulls the gems near it
  lotus: lv(0.2, 0, 240, 3, 330),
  // Boundless Light: three beams
  halo: lv(0, 3, 540, 1.1, 400),
  // Thunder Roar: all the way round, and it shatters the bullets it reaches
  roar: lv(1.5, 0, 560, 0, 280),
  // Heavenly Seal: every talisman that strikes bursts in a seal of EVOLVE.sealRadius
  talisman: lv(1.2, 10, 80, 2.4, 220),
  // Thunder Rain: EVOLVE.bombVolley bombs a throw, each at a different enemy
  bomb: lv(1.1, 5, 280, 0, 170),
  // Thousand Blades: volleyed knives fly back to the circle, cutting both ways
  knives: lv(0.22, 10, 70, 0, 110),
};

export const EVOLVE = {
  /** Mountain Palm: the print pins mobs inside and burns at this share of the blast. */
  palmBurnPercent: 30,
  /** Endless Chain: a fork reaches this share of the jump range. */
  forkRangePercent: 80,
  /** Healing Incense: per mille of max health healed per field tick while inside. */
  incenseHeal: 12,
  bellGuard: ticks(2),
  /** Cymbal Wheel: orbit radius, one turn per `turn`, a target is hit again after `rehit`. */
  wheelOrbit: toFp(260),
  wheelTurn: ticks(1.4),
  wheelRehit: ticks(0.5),
  /** Meteor Ball: splinters per bounce and how far they look for a target. */
  splinters: 2,
  splinterRange: toFp(450),
  /** Heavenly Seal: the burst's radius and its share of the talisman's damage. */
  sealRadius: toFp(150),
  sealPercent: 60,
  /** Thunder Rain: bombs a throw. */
  bombVolley: 3,
};

export type CardKind = 'relic' | 'spell' | 'passive' | 'shrine' | 'evolve';

export type ShrineId = 'heal' | 'insight' | 'offering';
/** A shrine offers all three, always in this order. */
export const SHRINE_IDS: readonly ShrineId[] = ['heal', 'insight', 'offering'];

/**
 * A level-up card (the relic, a spell or a passive, new or one level up), an evolution (id:
 * the spell or the relic) or a shrine card.
 */
export interface Card {
  kind: CardKind;
  id: string;
}
