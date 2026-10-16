import { describe, expect, it } from 'vitest';
import { panelKey } from './panelKeys';

describe('panel keys', () => {
  it('maps Enter and Space to ok, Escape to back and P to pause', () => {
    expect(panelKey('Enter', false)).toBe('ok');
    expect(panelKey('NumpadEnter', false)).toBe('ok');
    expect(panelKey('Space', false)).toBe('ok');
    expect(panelKey('Escape', false)).toBe('back');
    expect(panelKey('KeyP', false)).toBe('pause');
  });

  it('ignores repeats and other keys', () => {
    expect(panelKey('Enter', true)).toBeNull();
    expect(panelKey('KeyW', false)).toBeNull();
  });
});
