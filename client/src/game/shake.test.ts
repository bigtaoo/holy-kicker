import { describe, expect, it } from 'vitest';
import { SHAKE, Shake } from './shake';

describe('Shake', () => {
  it('stays still for a kill or two', () => {
    const s = new Shake();
    s.kills(SHAKE.kills - 1);
    for (let i = 0; i < 10; i++) expect(s.step(1 / 60)).toEqual({ x: 0, y: 0 });
  });

  it('shakes for a burst, within its cap, and settles', () => {
    const s = new Shake();
    s.kills(100);
    let peak = 0;
    for (let i = 0; i < 6; i++) {
      const o = s.step(1 / 60);
      peak = Math.max(peak, Math.abs(o.x), Math.abs(o.y));
    }
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(SHAKE.max);
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    expect(s.step(1 / 60)).toEqual({ x: 0, y: 0 });
  });
});
