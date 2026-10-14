import { describe, expect, it } from 'vitest';
import { SHAKE, Shake } from './shake';

const TICK = 1 / 30;

/** The largest offset over `frames` frames of 1/60 s. */
function peak(s: Shake, frames: number): number {
  let p = 0;
  for (let i = 0; i < frames; i++) {
    const o = s.step(1 / 60);
    p = Math.max(p, Math.abs(o.x), Math.abs(o.y));
  }
  return p;
}

/** Feeds `ticks` ticks of `n` kills each, stepping real time with them. */
function feed(s: Shake, n: number, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    s.kills(n);
    s.step(TICK);
  }
}

describe('Shake', () => {
  it('stays still for a few kills at once', () => {
    const s = new Shake();
    s.kills(SHAKE.kills - 1);
    expect(peak(s, 10)).toBe(0);
  });

  it('shakes for a burst, within its cap, and settles', () => {
    const s = new Shake();
    s.kills(100);
    const p = peak(s, 6);
    expect(p).toBeGreaterThan(1);
    expect(p).toBeLessThanOrEqual(SHAKE.max);
    peak(s, 120);
    expect(s.step(1 / 60)).toEqual({ x: 0, y: 0 });
  });

  it('raises the bar with the kill rate, so a busy late wave does not shake all the time', () => {
    const s = new Shake();
    feed(s, 6, 300);
    s.kills(12);
    expect(peak(s, 10)).toBe(0);
    s.kills(30);
    expect(peak(s, 10)).toBeGreaterThan(1);
  });

  it('rests after a shake, in real time', () => {
    const s = new Shake();
    s.kills(20);
    peak(s, 30); // half a second
    s.kills(20);
    expect(peak(s, 10)).toBe(0);
    peak(s, Math.ceil(SHAKE.rest * 60));
    s.kills(20);
    expect(peak(s, 10)).toBeGreaterThan(1);
  });

  it('never shakes when the player turned it off', () => {
    const s = new Shake();
    s.on = false;
    s.kills(100);
    expect(peak(s, 10)).toBe(0);
  });
});
