import { describe, expect, it } from 'vitest';
import { FrameClock } from './frameClock';

/** The clock's steps for frames stamped at `stamps`, on a display of `vsync` ms, to the nearest ms. */
function steps(stamps: number[], vsync: number): number[] {
  const clock = new FrameClock();
  let prev = clock.tick(stamps[0], vsync);
  return stamps.slice(1).map((s) => {
    const t = clock.tick(s, vsync);
    const step = t - prev;
    prev = t;
    return Math.round(step);
  });
}

const V30 = 1000 / 30;
const V60 = 1000 / 60;

describe('FrameClock', () => {
  it('starts at the first stamp and gives even stamps back as they are', () => {
    const clock = new FrameClock();
    expect(clock.tick(500, V60)).toBe(500);
    expect(steps([0, V60, 2 * V60, 3 * V60, 5 * V60], V60)).toEqual([17, 17, 17, 33]);
  });

  it('steps a whole refresh through iOS callback jitter at 60 and 30 Hz: late, then early', () => {
    expect(steps([0, 24, 33, 50, 66.7], V60)).toEqual(Array(4).fill(17));
    // display ticks every 33.3 ms; callbacks run 1-3 ms after, one 20 ms late and the next on time
    // (within a millisecond: the clock gives the lateness back over the next frames)
    const stamps = [1, 35.3, 68.7, 120, 135, 168.5, 201.9, 234];
    for (const s of steps(stamps, V30)) expect(Math.abs(s - V30)).toBeLessThanOrEqual(1);
  });

  it('keeps a refresh that was really missed', () => {
    expect(steps([0, V30, 3 * V30, 4 * V30], V30)).toEqual([33, 67, 33]);
    // a miss split over two late gaps still adds up to its refreshes
    expect(steps([0, 50, 100], V30)).toEqual([33, 67]);
  });

  it('keeps to real time over a long jittery run', () => {
    const clock = new FrameClock();
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
      const tick = i * (1000 / 60.1);
      const late = rnd() < 0.05 ? 8 + rnd() * 6 : rnd() * 3;
      const now = tick + late;
      worst = Math.max(worst, Math.abs(clock.tick(now, 1000 / 60.1) - tick));
    }
    expect(worst).toBeLessThan(2 * V60);
  });

  it('measures the refresh itself when the gate reads it a few percent short', () => {
    // 30 Hz with a late callback now and then; the gate says 32 ms. Stepping 32 ms would fall
    // behind real time and catch up with a double step about every second.
    const clock = new FrameClock();
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let prev = clock.tick(0, 32);
    const late: number[] = [];
    for (let i = 1; i < 900; i++) {
      const t = clock.tick(i * V30 + (rnd() < 0.05 ? 10 + rnd() * 12 : rnd() * 3), 32);
      if (i > 60 && t - prev > 1.5 * V30) late.push(i);
      prev = t;
    }
    expect(late).toEqual([]);
  });

  it('takes a pause as it is and starts counting again after it', () => {
    expect(steps([0, V60, V60 + 250, 2 * V60 + 250], V60)).toEqual([17, 250, 17]);
  });

  it('draws the same time for a stamp that did not move', () => {
    const clock = new FrameClock();
    clock.tick(100, V60);
    expect(clock.tick(100, V60)).toBe(100);
  });
});
