import { describe, expect, it } from 'vitest';
import { cardKey } from './cardKeys';

describe('card keys', () => {
  it('moves the highlight up and down, round the ends', () => {
    expect(cardKey('ArrowDown', false, 0, 3)).toEqual({ focus: 1 });
    expect(cardKey('KeyS', false, 2, 3)).toEqual({ focus: 0 });
    expect(cardKey('ArrowUp', false, 0, 3)).toEqual({ focus: 2 });
    expect(cardKey('KeyW', false, 1, 3)).toEqual({ focus: 0 });
  });

  it('takes the highlighted card on Enter or Space, and a card by its number', () => {
    expect(cardKey('Enter', false, 1, 3)).toEqual({ pick: 1 });
    expect(cardKey('Space', false, 2, 3)).toEqual({ pick: 2 });
    expect(cardKey('Digit3', false, 0, 3)).toEqual({ pick: 2 });
    expect(cardKey('Numpad1', false, 2, 3)).toEqual({ pick: 0 });
    expect(cardKey('Digit3', false, 0, 2)).toBeNull();
  });

  it('ignores key repeats and other keys', () => {
    expect(cardKey('ArrowDown', true, 0, 3)).toBeNull();
    expect(cardKey('Enter', true, 0, 3)).toBeNull();
    expect(cardKey('KeyA', false, 0, 3)).toBeNull();
  });
});
