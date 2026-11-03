import { describe, expect, it } from 'vitest';
import { EIGHT, KEY_HOLD, KEY_ORDER, dirKeys, eightAt, litKey } from './tutorialHint';

describe('arrow key hint', () => {
  it('presses the keys round in turn, each for KEY_HOLD', () => {
    expect(litKey(0)).toBe('up');
    expect(litKey(KEY_HOLD * 1.5)).toBe('right');
    expect(litKey(KEY_HOLD * 3.2)).toBe('left');
    expect(litKey(KEY_HOLD * KEY_ORDER.length)).toBe('up');
    expect(litKey(-1)).toBe('up');
  });

  it('presses the key or two that walk the way the gather nudge points', () => {
    expect(dirKeys(0)).toEqual(['right']);
    expect(dirKeys(3)).toEqual(['down', 'left']);
    expect(dirKeys(6)).toEqual(['up']);
    expect(dirKeys(7)).toEqual(['up', 'right']);
  });
});

describe('touch move hint', () => {
  it('traces a sideways eight: through the middle twice a loop, out to both sides, up and down on each', () => {
    const at = (k: number) => eightAt(k * EIGHT.loop);
    expect(at(0).x).toBeCloseTo(0);
    expect(at(0.5).x).toBeCloseTo(0);
    expect(at(0.25).x).toBeCloseTo(EIGHT.w);
    expect(at(0.75).x).toBeCloseTo(-EIGHT.w);
    // each lobe goes out on one side of the middle line and back on the other
    for (const lobe of [0.125, 0.625]) {
      expect(at(lobe).y).toBeCloseTo(EIGHT.h);
      expect(at(lobe + 0.25).y).toBeCloseTo(-EIGHT.h);
    }
    expect(at(1).x).toBeCloseTo(at(0).x);
  });
});
