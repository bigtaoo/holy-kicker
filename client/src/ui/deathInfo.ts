import { isShrineWave, type HurtSource, type MonkId } from '@hk/engine';
import { BALANCE } from '../meta/balance';
import type { RunPast } from '../meta/falls';

// What the death panel says about a fall (docs/design.md "Flow"): what killed the hero, read
// from the last blow that hurt him, and the nearest goal he fell short of. Pure.

/**
 * Why the hero fell: overrun by the horde, an elite's or boss's touch, a charge, a slam, an
 * emerger, a bullet, a ground zone, or too few levels for the wave whatever the last blow was.
 */
export type DeathCause = 'crowd' | 'touch' | 'charge' | 'slam' | 'emerge' | 'bullet' | 'zone' | 'level';

/**
 * The goal a fall came closest to, `n` more waves away: wave `wave` (a chest, a shrine, the clear),
 * beating the best of `wave` waves, or (`record`, n 0) a new best of `wave` waves cleared.
 */
export interface Goal {
  kind: 'record' | 'chest' | 'shrine' | 'clear' | 'best';
  wave: number;
  n: number;
}

/** What the death panel shows besides the revive offer. */
export interface DownInfo {
  cause: DeathCause;
  goal: Goal | null;
  /** The monk who fell, for the picture (the kicker when unknown). */
  monk?: MonkId;
}

function causeOf(src: HurtSource | null): Exclude<DeathCause, 'level'> {
  switch (src) {
    case 'elite':
    case 'boss':
      return 'touch';
    case 'charge':
    case 'slam':
    case 'emerge':
    case 'bullet':
    case 'zone':
      return src;
    default:
      return 'crowd';
  }
}

/** The level a hero normally has on `wave` (BALANCE.fall), straight between the measured waves. */
export function expectedLevel(wave: number): number {
  const { levelEvery, levels } = BALANCE.fall;
  const at = (i: number) => (i <= 0 ? 1 : levels[Math.min(i, levels.length) - 1]);
  const i = Math.floor(wave / levelEvery);
  if (i >= levels.length) return levels[levels.length - 1];
  return at(i) + ((at(i + 1) - at(i)) * (wave - i * levelEvery)) / levelEvery;
}

/** The cause of a fall on `wave` at `level`, from the last blow's source (null if none was seen). */
export function deathCause(src: HurtSource | null, level: number, wave: number): DeathCause {
  return level <= expectedLevel(wave) - BALANCE.fall.levelGap ? 'level' : causeOf(src);
}

/** Order among goals equally near: the chapter clear first, the shrine last. */
const RANK: Goal['kind'][] = ['clear', 'chest', 'best', 'shrine'];

/**
 * The nearest goal of a run that fell on `wave` of a chapter of `last` waves: a new best when it
 * beat the chapter's, else whichever of the next unclaimed progress chest, beating the best, the
 * next shrine and the chapter clear is the fewest waves away. Null in the sandbox.
 */
export function nearestGoal(wave: number, last: number, past: RunPast): Goal | null {
  if (last <= 0) return null;
  const cleared = Math.max(0, wave - 1);
  if (past.best > 0 && cleared > past.best) return { kind: 'record', wave: cleared, n: 0 };
  // chests, the best and the clear count waves cleared; a shrine waits at the start of its wave
  const goals: Goal[] = [{ kind: 'clear', wave: last, n: last - cleared }];
  const chest = BALANCE.chests.findIndex((c, k) => !(past.chests & (1 << k)) && c.wave > cleared);
  if (chest >= 0) goals.push({ kind: 'chest', wave: BALANCE.chests[chest].wave, n: BALANCE.chests[chest].wave - cleared });
  if (past.best > 0) goals.push({ kind: 'best', wave: past.best, n: past.best + 1 - cleared });
  for (let w = wave + 1; w < last; w++) {
    if (isShrineWave(w, last)) {
      goals.push({ kind: 'shrine', wave: w, n: w - wave });
      break;
    }
  }
  goals.sort((a, b) => a.n - b.n || RANK.indexOf(a.kind) - RANK.indexOf(b.kind));
  return goals[0];
}
