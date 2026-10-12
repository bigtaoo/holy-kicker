import { describe, expect, it } from 'vitest';
import { KEY_HOLD, KEY_ORDER, litKey } from './tutorialHint';

describe('arrow key hint', () => {
  it('presses the keys round in turn, each for KEY_HOLD', () => {
    expect(litKey(0)).toBe('up');
    expect(litKey(KEY_HOLD * 1.5)).toBe('right');
    expect(litKey(KEY_HOLD * 3.2)).toBe('left');
    expect(litKey(KEY_HOLD * KEY_ORDER.length)).toBe('up');
    expect(litKey(-1)).toBe('up');
  });
});
