import { describe, expect, it } from 'vitest';
import { DragStick } from './dragStick';

describe('DragStick', () => {
  it('is idle until a finger goes down', () => {
    const s = new DragStick(100);
    expect(s.read()).toEqual({ x: 0, y: 0 });
    expect(s.origin()).toBeNull();
  });

  it('measures the drag from where the finger went down', () => {
    const s = new DragStick(100);
    s.down(1, 200, 300);
    s.move(1, 250, 300);
    expect(s.read()).toEqual({ x: 0.5, y: 0 });
    expect(s.origin()).toEqual({ x: 200, y: 300 });
  });

  it('clamps to unit length and ignores the dead zone', () => {
    const s = new DragStick(100, 0.2);
    s.down(1, 0, 0);
    s.move(1, 300, 400);
    expect(Math.hypot(s.read().x, s.read().y)).toBeCloseTo(1);
    s.move(1, 10, 0);
    expect(s.read()).toEqual({ x: 0, y: 0 });
  });

  it('follows only the first finger and resets on release', () => {
    const s = new DragStick(100);
    s.down(1, 0, 0);
    s.down(2, 500, 500);
    s.move(2, 600, 500);
    expect(s.read()).toEqual({ x: 0, y: 0 });
    s.move(1, 0, 100);
    s.up(2);
    expect(s.read()).toEqual({ x: 0, y: 1 });
    s.up(1);
    expect(s.read()).toEqual({ x: 0, y: 0 });
    expect(s.origin()).toBeNull();
  });
});
