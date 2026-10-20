// How busy the battlefield is, 0 (the opening: a few mobs, a hit now and then) to 1 (late in a
// chapter: spells landing dozens of hits a second on a full screen). Effects read it to keep the
// screen's total noise about even: an early hit gets a big burst, so the opening feels lively,
// and a late one a small pop, so a hundred of them still read (fx.ts, damage.ts, ballView.ts).
//
// Pure, fed once per sim tick, so fast-forward neither heats nor cools it faster. Measured with
// the balance bot on chapter 1: the opening lands 3-5 hits a second with 30-40 mobs on screen,
// waves 25 and later 50-120 hits a second with 60-90 mobs.

import { TICK_RATE } from '@hk/engine';

export const HEAT = {
  /** Hits a second (recent mean) that start warming, and that are fully hot. */
  hitsCold: 8,
  hitsHot: 60,
  /** Mobs on screen that start warming, and that are fully hot. */
  crowdCold: 50,
  crowdHot: 110,
  /** Ticks the mean hit rate looks back over (2 s). */
  window: 2 * TICK_RATE,
  /** Ticks for heat to close ~63 % of the gap: quick to heat, slow to cool, so a lull between
   *  waves does not pump the effects up and down. */
  rise: TICK_RATE,
  fall: 4 * TICK_RATE,
};

/** 0 at `lo` or under, 1 at `hi` or over, smooth between. */
export function ramp(v: number, lo: number, hi: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** `cold` at heat 0, `hot` at heat 1. */
export function byHeat(heat: number, cold: number, hot: number): number {
  return cold + (hot - cold) * heat;
}

export class FxHeat {
  /** 0..1. */
  value = 0;
  /** Recent mean hits per second. */
  private rate = 0;

  /** One sim tick: the hits it landed and the mobs on screen after it. */
  tick(hits: number, onScreen: number): void {
    this.rate += (hits * TICK_RATE - this.rate) / HEAT.window;
    const target = Math.max(ramp(this.rate, HEAT.hitsCold, HEAT.hitsHot), ramp(onScreen, HEAT.crowdCold, HEAT.crowdHot));
    this.value += (target - this.value) / (target > this.value ? HEAT.rise : HEAT.fall);
  }

  reset(): void {
    this.value = this.rate = 0;
  }
}
