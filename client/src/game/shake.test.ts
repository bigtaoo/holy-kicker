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

  it('shakes on the hero going down, never when off', () => {
    const s = new Shake();
    s.blow();
    expect(peak(s, 3)).toBeGreaterThan(SHAKE.down / 2);
    const off = new Shake();
    off.on = false;
    off.blow();
    expect(peak(off, 10)).toBe(0);
  });

  it('punches once along the blow, out and back within its time', () => {
    const s = new Shake();
    s.punch(3, 4, 2);
    let far = { x: 0, y: 0 };
    for (let i = 0; i < Math.ceil(SHAKE.punchTime * 60) - 1; i++) {
      const o = s.step(1 / 60);
      if (Math.hypot(o.x, o.y) > Math.hypot(far.x, far.y)) far = o;
    }
    expect(Math.hypot(far.x, far.y)).toBeGreaterThan(1.5);
    expect(Math.hypot(far.x, far.y)).toBeLessThanOrEqual(2 + 1e-9);
    // along the unit direction (0.6, 0.8)
    expect(far.x / far.y).toBeCloseTo(0.75);
    s.step(1 / 60);
    expect(s.step(1 / 60)).toEqual({ x: 0, y: 0 });
  });

  it('starts a punch without a jump and ignores a zero direction', () => {
    const s = new Shake();
    s.punch(0, 0, 3);
    expect(peak(s, 10)).toBe(0);
    s.punch(1, 0, 3);
    expect(Math.abs(s.step(1 / 240).x)).toBeLessThan(0.5);
  });

  it('does not stack rapid punches past its cap', () => {
    const s = new Shake();
    let p = 0;
    for (let i = 0; i < 60; i++) {
      s.punch(1, 0.1 * (i % 3), 2.5);
      const o = s.step(1 / 60);
      p = Math.max(p, Math.hypot(o.x, o.y));
    }
    expect(p).toBeGreaterThan(2.5);
    expect(p).toBeLessThanOrEqual(SHAKE.punchMax + 1e-9);
  });

  it('adds a punch to a running shake', () => {
    const a = new Shake();
    const b = new Shake();
    a.blow();
    b.blow();
    b.punch(1, 0, 3);
    a.step(1 / 60);
    b.step(1 / 60);
    const oa = a.step(1 / 60);
    const ob = b.step(1 / 60);
    expect(ob.x - oa.x).toBeGreaterThan(1);
    expect(ob.y).toBeCloseTo(oa.y);
  });

  it('never punches when the player turned shake off', () => {
    const s = new Shake();
    s.on = false;
    s.punch(1, 0, 3);
    expect(peak(s, 10)).toBe(0);
    const late = new Shake();
    late.punch(1, 0, 3);
    late.on = false;
    expect(peak(late, 10)).toBe(0);
  });
});
