import { describe, expect, it } from 'vitest';
import { GATHER, GatherNudge, gatherDir } from './gatherNudge';

/** Steps `n` frames of `dt`, returning whether the nudge showed after the last. */
function run(g: GatherNudge, secs: number, moving: boolean, lying: number, dt = 0.1): boolean {
  let on = g.on;
  for (let k = 0; k < Math.round(secs / dt); k++) on = g.step(dt, moving, lying);
  return on;
}

describe('gather nudge', () => {
  it('shows once the hero stands still with a level lying around', () => {
    const g = new GatherNudge();
    expect(run(g, GATHER.still - 0.5, false, 1)).toBe(false);
    expect(run(g, 1, false, 1)).toBe(true);
  });

  it('stays quiet with too little lying around, or while the hero walks', () => {
    expect(run(new GatherNudge(), 10, false, GATHER.share - 0.1)).toBe(false);
    expect(run(new GatherNudge(), 10, true, 3)).toBe(false);
  });

  it('goes as soon as the hero moves, then waits before showing again', () => {
    const g = new GatherNudge();
    run(g, GATHER.still + 0.5, false, 1);
    expect(run(g, 0.1, true, 1)).toBe(false);
    expect(run(g, GATHER.wait - 1, false, 1)).toBe(false);
    expect(run(g, 1.5, false, 1)).toBe(true);
  });

  it('goes when the gems are gone, and shows at most GATHER.shows times', () => {
    const g = new GatherNudge();
    let shown = 0;
    for (let k = 0; k < GATHER.shows + 2; k++) {
      if (run(g, GATHER.still + 0.5, false, 1)) shown++;
      expect(run(g, 0.1, false, 0)).toBe(false);
      run(g, GATHER.wait + 1, true, 1);
    }
    expect(shown).toBe(GATHER.shows);
  });

  it('points to the eighth of the circle holding the most experience', () => {
    const gem = (x: number, y: number, value = 10) => ({ x, y, value });
    expect(gatherDir([gem(100, 0), gem(-100, 0), gem(-120, 10)], 0, 0, 500)).toBe(4);
    expect(gatherDir([gem(0, 100, 30), gem(70, 70), gem(70, 70)], 0, 0, 500)).toBe(2);
    expect(gatherDir([gem(70, -70)], 0, 0, 500)).toBe(7);
    expect(gatherDir([gem(0, -100), gem(900, 0, 99)], 0, 0, 500)).toBe(6);
  });
});
