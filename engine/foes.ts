import { perTick, ticks, toFp } from './math/fixed';
import { degToBrad } from './math/trig';

// Tuning of the chapters' enemies past the plain horde (docs/content.md "Enemies" and
// "Chapters"): the mob mechanics, the elites and the bosses, in FP units per tick and whole
// ticks. Split out of config.ts, which re-exports all of it.

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
  cooldown: ticks(6),
  spread: ticks(2),
  windup: ticks(0.5),
};

/**
 * The ice wraith, a zone caster (systems/snow.ts): it stops stopDist from the hero; every
 * cooldown..cooldown+spread it raises its arms for `windup` (with him within range), then marks
 * a frost circle of `radius` where he stands, which goes off after THREATS.warn (HURT.frost).
 */
export const CASTER = {
  stopDist: toFp(520),
  range: toFp(820),
  cooldown: ticks(5),
  spread: ticks(2),
  windup: ticks(0.6),
  radius: toFp(150),
};

/**
 * The wolf leader, chapter 3's elite (systems/elite.ts): it charges like the big jiangshi and,
 * every other time instead, howls for `howl`, then every mob within howlRadius of it runs at
 * hastePercent of its speed for `haste`.
 */
export const WOLF_LEADER = {
  hp: 600,
  speed: perTick(190),
  knockback: toFp(110),
  howl: ticks(0.8),
  howlRadius: toFp(900),
  haste: ticks(4),
  hastePercent: 160,
};

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

/**
 * The empowered Fallen Abbot, chapter 2's mid-boss on and in place of the twins (docs/content.md):
 * the boss with its own health and a shorter rest between slams, every slam also sending a
 * ring of `ring` bullets out from the rim of its circle.
 */
export const EMPOWERED = {
  hp: 1500,
  cooldown: ticks(2.2),
  ring: 8,
};

/**
 * The empowered Black Carp King, chapter 3's mid-boss: its own health, a shorter wait between
 * dives and a fuller bullet ring when it surfaces.
 */
export const EMPOWERED_CARP = {
  hp: 2600,
  cooldown: ticks(2.4),
  ring: 16,
};

/**
 * The Black Carp King, chapter 2's boss (systems/carp.ts): it swims after the hero to stopDist
 * and, its cooldown done, dives for `dive` (out of reach, swimming under him at `swim`), then
 * locks a circle of `radius` where he stands and rises under it for `rise`. Surfacing it hurts
 * him inside (HURT.surface) and sends a ring of `ring` bullets out from the rim, then lies
 * winded for `recover`, the time to kick it. It comes to the hero, so it is kicked more than
 * the abbot, whom the bot keeps away from: with 2400 health it fell in a median 52 s, quicker
 * than the mid-boss; with 4000, 80–90 s.
 */
export const CARP = {
  hp: 4000,
  speed: perTick(110),
  swim: perTick(520),
  stopDist: toFp(160),
  cooldown: ticks(3),
  dive: ticks(1.2),
  rise: ticks(1.0),
  recover: ticks(1.2),
  radius: toFp(240),
  ring: 12,
};

/**
 * The Bone Witch, chapter 3's boss (systems/witch.ts): she walks to stopDist from the hero and,
 * her cooldown done and him within range, raises her staff for `windup`, then in turn summons
 * `summon` skeletons around her (at near..far, while fewer than maxSkeletons stand) or throws a
 * fan of `fan` bone bullets at him, and rests for `recover`. A skeleton that falls splits into
 * `shards` bone crawlers (systems/snow.ts). She keeps up with a hero who runs: at the abbot's
 * pace the bot outran her kicks and fights ran to 10+ minutes; at 160 she falls in about 80 s.
 */
export const WITCH = {
  hp: 4000,
  speed: perTick(160),
  stopDist: toFp(240),
  range: toFp(900),
  cooldown: ticks(2.6),
  windup: ticks(0.9),
  recover: ticks(0.5),
  summon: 3,
  maxSkeletons: 6,
  near: toFp(140),
  far: toFp(260),
  fan: 7,
  shards: 2,
  shardSpread: toFp(40),
};

/**
 * The paper effigy, chapter 4's splitter (systems/ghost.ts): a horde mob that, when it falls,
 * tears into `scraps` paper scraps side by side (while fewer than maxScraps stand). Scraps fall
 * for good and lie under the ground until another effigy tears, like the witch's shards.
 */
export const EFFIGY = {
  scraps: 2,
  spread: toFp(40),
  maxScraps: 24,
};

/**
 * The door god, chapter 4's elite, a shielder (systems/ghost.ts): it walks at the hero to
 * stopDist, turning at most `turn` brads a tick, and its shield takes every relic hit that
 * comes from within blockHalf of where it faces (spells still hit). With the hero within
 * `range` and its cooldown done it raises its halberd for THREATS.warn on a circle of `radius`
 * `reach` ahead (HURT.smash), then stands winded for `rest` with its shield down.
 */
export const DOOR_GOD = {
  hp: 600,
  speed: perTick(110),
  stopDist: toFp(200),
  turn: degToBrad(100 / 30),
  blockHalf: degToBrad(70),
  knockback: toFp(20),
  range: toFp(420),
  reach: toFp(190),
  radius: toFp(190),
  rest: ticks(1.6),
  cooldown: ticks(2.4),
};

/**
 * The empowered Bone Witch, chapter 4's mid-boss: her own health, a shorter rest, a bigger
 * guard of skeletons and a wider bone fan.
 */
export const EMPOWERED_WITCH = {
  hp: 2600,
  cooldown: ticks(2.2),
  summon: 4,
  maxSkeletons: 8,
  fan: 9,
};

/**
 * The Underworld Judge, chapter 4's boss (systems/judge.ts): he keeps stopDist from the hero
 * and, his cooldown done and the hero within range, raises his brush for `windup`, then in
 * turn writes a line of zones (HURT.verdict) from himself through the hero, each going off
 * `stagger` after the last like a brush stroke, or flicks a fan of `fan` ink bullets; he rests
 * for `recover`. Below ragePercent of his health he changes his verdicts: the lines become a
 * cross through the hero, the fans a ring of `ring` bullets, and he rests rageCooldown.
 */
export const JUDGE = {
  hp: 4400,
  speed: perTick(150),
  stopDist: toFp(320),
  range: toFp(1000),
  cooldown: ticks(2.4),
  rageCooldown: ticks(1.9),
  ragePercent: 50,
  windup: ticks(0.8),
  recover: ticks(0.6),
  zones: 7,
  step: toFp(170),
  radius: toFp(105),
  first: toFp(170),
  stagger: 3,
  fan: 5,
  ring: 14,
};
