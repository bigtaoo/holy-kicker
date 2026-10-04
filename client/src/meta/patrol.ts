import { BALANCE } from './balance';
import { bump, today } from './daily';
import { rollItems } from './gear';
import { payHaul, type Haul } from './haul';
import { bestChapter, copperPerWave, unlockedRelics } from './progress';
import type { SaveData } from './save';

// Patrol (docs/design.md "Retention"): idle income that piles up while the player is away, up
// to a cap, scaled by the highest cleared chapter. Mostly gear, a little copper. A rewarded ad
// doubles a collection; a quick patrol pays a few hours at once for an ad or for jade, a few
// times a day. Opens with the shop. Pure: takes a save and `now` (ms), returns a new save.

export interface PatrolBalance {
  capHours: number;
  /** Copper per hour, percent of a full clear of the highest cleared chapter. */
  copperPercent: number;
  /** One item per this many hours patrolled. */
  dropHours: number;
  /** The least time worth collecting. */
  minMinutes: number;
  /** The least time the ad may double. */
  doubleMinHours: number;
  quickHours: number;
  quickDrops: number;
  quickAdsPerDay: number;
  quickJade: number;
  quickJadePerDay: number;
}

const PATROL = BALANCE.patrol;
const HOUR = 3600 * 1000;

export function patrolOpen(save: SaveData): boolean {
  return save.cleared >= BALANCE.unlocks.shopChapter;
}

/** Starts the patrol the first time the lobby sees it open. */
export function startPatrol(save: SaveData, now: number): SaveData {
  return patrolOpen(save) && save.patrol === 0 ? { ...save, patrol: now } : save;
}

/** Hours piled up, capped; a clock that went back counts as none. */
export function patrolHours(save: SaveData, now: number): number {
  if (!save.patrol) return 0;
  return Math.min(PATROL.capHours, Math.max(0, (now - save.patrol) / HOUR));
}

export function copperPerHour(save: SaveData): number {
  return (BALANCE.waves * copperPerWave(bestChapter(save)) * PATROL.copperPercent) / 100;
}

/** Items `hours` of patrol bring (whole items only; the rest of the time is lost on collecting). */
export function patrolDrops(hours: number): number {
  return Math.floor(hours / PATROL.dropHours);
}

/** What `hours` of patrol pay, `mul` times over (the ad doubles). */
export function patrolHaul(save: SaveData, hours: number, mul = 1, rand: () => number = Math.random): Haul {
  return {
    copper: Math.floor(copperPerHour(save) * hours) * mul, jade: 0,
    drops: rollItems(bestChapter(save), patrolDrops(hours) * mul, unlockedRelics(save), rand),
  };
}

export function canCollect(save: SaveData, now: number): boolean {
  return patrolHours(save, now) * 60 >= PATROL.minMinutes;
}

export function canDouble(save: SaveData, now: number): boolean {
  return patrolHours(save, now) >= PATROL.doubleMinHours;
}

/** Collects what piled up (doubled after an ad) and starts over; null when there is too little. */
export function collectPatrol(save: SaveData, now: number, double: boolean, rand: () => number = Math.random): { save: SaveData; haul: Haul } | null {
  if (!canCollect(save, now) || (double && !canDouble(save, now))) return null;
  const haul = patrolHaul(save, patrolHours(save, now), double ? 2 : 1, rand);
  return { save: bump({ ...payHaul(save, haul), patrol: now }, now, 'patrol', 1), haul };
}

/** A start in the future (the clock went back) restarts from now, so the patrol is not stuck. */
export function fixPatrolClock(save: SaveData, now: number): SaveData {
  return save.patrol > now ? { ...save, patrol: now } : save;
}

export type QuickPay = 'ad' | 'jade';

/** Quick patrols left today. */
export function quickLeft(save: SaveData, now: number, pay: QuickPay): number {
  const d = today(save, now);
  return pay === 'ad' ? Math.max(0, PATROL.quickAdsPerDay - d.quickAds) : Math.max(0, PATROL.quickJadePerDay - d.quickJade);
}

/** Pays a quick patrol (the ad already watched, or the jade spent here); null when none is left or the jade is short. */
export function quickPatrol(save: SaveData, now: number, pay: QuickPay, rand: () => number = Math.random): { save: SaveData; haul: Haul } | null {
  if (!patrolOpen(save) || quickLeft(save, now, pay) === 0) return null;
  if (pay === 'jade' && save.jade < PATROL.quickJade) return null;
  const d = today(save, now);
  const haul: Haul = {
    copper: Math.floor(copperPerHour(save) * PATROL.quickHours), jade: 0,
    drops: rollItems(bestChapter(save), PATROL.quickDrops, unlockedRelics(save), rand),
  };
  const daily = pay === 'ad' ? { ...d, quickAds: d.quickAds + 1 } : { ...d, quickJade: d.quickJade + 1 };
  const paid = payHaul({ ...save, daily, jade: save.jade - (pay === 'jade' ? PATROL.quickJade : 0) }, haul);
  return { save: bump(paid, now, 'patrol', 1), haul };
}
