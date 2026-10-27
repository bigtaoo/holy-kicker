import { describe, expect, it } from 'vitest';
import { HOVER_DEAD, HOVER_FULL, HoverPointer, hoverMove, steer } from './hoverSteer';

const ZERO = { x: 0, y: 0 };
const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('hoverMove', () => {
  it('stands still with the pointer on the hero', () => {
    expect(hoverMove({ x: 100, y: 100 }, { x: 100, y: 100 })).toEqual(ZERO);
    expect(hoverMove({ x: 100 + HOVER_DEAD, y: 100 }, { x: 100, y: 100 })).toEqual(ZERO);
  });

  it('walks toward the pointer, slowly near the dead zone and at full speed far off', () => {
    const near = hoverMove({ x: HOVER_DEAD + 1, y: 0 }, ZERO);
    expect(near.x).toBeGreaterThan(0.2);
    expect(near.x).toBeLessThan(0.3);
    expect(near.y).toBe(0);
    expect(len(hoverMove({ x: 0, y: -HOVER_FULL }, ZERO))).toBeCloseTo(1);
    const far = hoverMove({ x: -3000, y: 4000 }, ZERO);
    expect(far.x).toBeCloseTo(-0.6);
    expect(far.y).toBeCloseTo(0.8);
  });
});

describe('HoverPointer', () => {
  it('steers only after a move, until the mouse leaves', () => {
    const p = new HoverPointer();
    expect(p.read()).toBeNull();
    p.move(10, 20);
    expect(p.read()).toEqual({ x: 10, y: 20 });
    p.leave();
    expect(p.read()).toBeNull();
  });

  it('once quieted, waits for the mouse to move again', () => {
    const p = new HoverPointer();
    p.move(10, 20);
    p.quiet();
    expect(p.read()).toBeNull();
    p.move(11, 20);
    expect(p.read()).toEqual({ x: 11, y: 20 });
  });
});

describe('steer', () => {
  const toward = (at: { x: number; y: number }) => ({ x: Math.sign(at.x), y: 0 });

  it('follows the hovering mouse when nothing else steers', () => {
    const p = new HoverPointer();
    p.move(5, 0);
    expect(steer(false, ZERO, ZERO, p, toward)).toEqual({ x: 1, y: 0 });
  });

  it('lets the keys win, and does not walk back to the mouse when they are let go', () => {
    const p = new HoverPointer();
    p.move(5, 0);
    expect(steer(false, ZERO, { x: 0, y: -1 }, p, toward)).toEqual({ x: 0, y: -1 });
    expect(steer(false, ZERO, ZERO, p, toward)).toEqual(ZERO);
    p.move(-5, 0);
    expect(steer(false, ZERO, ZERO, p, toward)).toEqual({ x: -1, y: 0 });
  });

  it('lets a held drag win, even in its dead zone', () => {
    const p = new HoverPointer();
    p.move(5, 0);
    expect(steer(true, ZERO, ZERO, p, toward)).toEqual(ZERO);
    expect(p.read()).toBeNull();
  });

  it('stands still without a pointer, or where the run cannot place it', () => {
    expect(steer(false, ZERO, ZERO, undefined, toward)).toEqual(ZERO);
    const p = new HoverPointer();
    p.move(5, 0);
    expect(steer(false, ZERO, ZERO, p, () => null)).toEqual(ZERO);
  });
});
