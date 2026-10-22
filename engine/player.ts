import { HERO } from './config';
import type { Card, MonkId, PassiveId, RelicId, SpellId, StatBonus } from './content';
import type { Body } from './state';

// A hero in the simulation state (state.ts): position, the stick, health, the build.

export type HeroAction = 'none' | 'kick' | 'hurt';

export interface Player extends Body {
  owner: number;
  vx: number;
  vy: number;
  /** -1 facing left, 1 right. */
  facing: number;
  moving: boolean;
  /** Ticks stood still, up to ZEN.enter (in Zen once there; systems/players.ts). */
  still: number;
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
  /** The lowest health over the run, percent of the max health at the time: a clear's stars (docs/design.md "Stars"). */
  lowest: number;
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
  /** Stats brought from outside the run (RunConfig.bonus, and the monk's), under the passives in the stack. */
  bonus: StatBonus;
  monk: MonkId;
  /** Blows taken while running, for the novice's dodge (MONK_PASSIVE.dodgeEvery). */
  dodge: number;
  /** Ticks up so far, those of them moving, and the ground covered (FP): how the run was played (run_end's kiting signal). */
  live: number;
  moved: number;
  travel: number;
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

export function newPlayer(owner: number, x: number, y: number, hp = HERO.hp, revives = 0, relicId: RelicId = 'ball', bonus: StatBonus = {}, monk: MonkId = 'kicker'): Player {
  return {
    x, y, px: x, py: y, owner, vx: 0, vy: 0, facing: -1, moving: false, still: 0, moveBrad: 0, moveMag: 0,
    action: 'none', actionT: 0, struck: false, kickCd: 0, hurtCd: 0, level: 1, xp: 0, xpPart: 0,
    hp, maxHp: hp, dead: false, revives, lowest: 100, regen: 0, relicId, relic: 1, awakened: false, spells: [], passives: [], bell: false, offer: [],
    bet: false, offerings: 0, taps: 0, halo: 0, bonus, monk, dodge: 0,
    live: 0, moved: 0, travel: 0,
  };
}
