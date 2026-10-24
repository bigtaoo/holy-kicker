import { TICK_RATE } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { clockSecs, clockTenths, shownSecond, tenthsOf, timerShown, verdict } from './clearTime';

describe('clear time', () => {
  it('counts simulated ticks in tenths of a second', () => {
    expect(tenthsOf(0)).toBe(0);
    expect(tenthsOf(TICK_RATE)).toBe(10);
    expect(tenthsOf(TICK_RATE * 252 + TICK_RATE / 2)).toBe(2525);
  });

  it('formats as the boards do', () => {
    expect(clockTenths(0)).toBe('0:00.0');
    expect(clockTenths(2380)).toBe('3:58.0');
    expect(clockTenths(36007)).toBe('60:00.7');
    expect(clockSecs(2529)).toBe('4:12');
    expect(clockSecs(95)).toBe('0:09');
  });

  it('changes the HUD clock once a second', () => {
    expect(shownSecond(TICK_RATE - 1)).toBe(0);
    expect(shownSecond(TICK_RATE)).toBe(1);
  });

  it('shows the clock only where the chapter was cleared, or in a challenge', () => {
    expect(timerShown(false, false)).toBe(false);
    expect(timerShown(true, false)).toBe(true);
    expect(timerShown(false, true)).toBe(true);
  });

  it('compares a time with the best before it', () => {
    expect(verdict(2400, 0)).toBeNull();
    expect(verdict(2380, 2461)).toEqual({ kind: 'faster', s: '8.1' });
    expect(verdict(2380, 2380)).toEqual({ kind: 'stands', best: '3:58.0' });
    expect(verdict(2500, 2380)).toEqual({ kind: 'stands', best: '3:58.0' });
  });
});
