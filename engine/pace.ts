import { ticks, toFp } from './math/fixed';

// The pace of the later chapters (docs/design.md "Pace from chapter 3"): waves that wait for the
// hero's kills, and a horde that does not stay behind him. Re-exported by config.ts.

export const PACE = {
  /** The first chapter both rules play in: chapters 1 and 2 keep the plain clock and horde. */
  from: 3,
  /**
   * A normal-mode wave (not hard mode's) lasts until its horde has been felled gatePercent percent
   * over, at least WAVES.ticks and at most gateTicks (systems/waves.ts holds), so a hero whose
   * kills fall behind gets more of the same mobs, and their XP, before the next wave's.
   */
  gatePercent: 50,
  gateTicks: ticks(22.5),
  /**
   * A mob kept off every hero's screen for lagTicks that came less than lagGain nearer in that
   * time (he outran it, or runs rings round it) comes back ahead of him like a far one
   * (systems/horde.ts outrun), one every lagEvery ticks at most, so circling the horde is no
   * escape either; more at once walled every hero in (balance bots, 2026-10-20).
   */
  lagTicks: ticks(3),
  lagGain: toFp(150),
  lagEvery: ticks(1),
};
