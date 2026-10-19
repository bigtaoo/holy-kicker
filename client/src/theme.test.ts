import { describe, expect, it } from 'vitest';
import { MemoryStore } from './meta/saveStore';
import { THEME, themedStore } from './theme';

describe('themedStore', () => {
  it('keeps the monk keys and moves the corgi ones aside', () => {
    const base = new MemoryStore();
    themedStore(base, 'monk').setItem('hk.save', 'monk');
    themedStore(base, 'corgi').setItem('hk.save', 'corgi');
    expect(base.getItem('hk.save')).toBe('monk');
    expect(base.getItem('corgi:hk.save')).toBe('corgi');
    expect(themedStore(base, 'corgi').getItem('hk.save')).toBe('corgi');
  });

  it('runs the tests as the monk build', () => {
    expect(THEME).toBe('monk');
  });
});
