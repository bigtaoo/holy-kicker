import { describe, expect, it } from 'vitest';
import { CorgiMotion, MAX_ARM, MAX_AIM, aimSide, follow, headTurn, pawAim, runRate, wrapAngle } from './corgiMotion';

const DEG = Math.PI / 180;

describe('corgi motion', () => {
  it('wraps angles into -π..π', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it('swaps sides only past the dead zone', () => {
    expect(aimSide(-1, 10, 14)).toBe(-1); // just right of the body: the left gun stays up
    expect(aimSide(-1, 20, 14)).toBe(1);
    expect(aimSide(1, -10, 14)).toBe(1);
    expect(aimSide(1, -20, 14)).toBe(-1);
  });

  it('aims a paw at its target, clamped to its own side', () => {
    const left = pawAim(Math.PI, Math.PI + 20 * DEG);
    expect(left.gun).toBeCloseTo(Math.PI + 20 * DEG);
    expect(left.arm).toBeCloseTo(Math.PI + 20 * DEG);
    // straight up from the right paw: the gun reaches it, the arm stops at 55°
    const up = pawAim(0, -90 * DEG);
    expect(up.gun).toBeCloseTo(-90 * DEG);
    expect(up.arm).toBeCloseTo(-MAX_ARM);
    // behind the left paw (a target on the right) clamps to the reach past vertical
    const behind = pawAim(Math.PI, 0.01);
    expect(Math.abs(behind.dev)).toBeCloseTo(MAX_AIM);
  });

  it('turns the head a little and not past its limit', () => {
    expect(headTurn(20 * DEG)).toBeCloseTo(2.4);
    expect(headTurn(-90 * DEG)).toBe(-6);
  });

  it('matches the run cycle to the speed, backwards going right', () => {
    expect(runRate(-420, 420, 420)).toBeCloseTo(1.5);
    expect(runRate(420, 420, 420)).toBeCloseTo(-1.5);
    expect(runRate(-50, 50, 420)).toBeCloseTo(0.6); // slow steps do not crawl
  });

  it('follows a target steadily', () => {
    expect(follow(0, 10, 4, 0.1)).toBeCloseTo(4);
    expect(follow(0, 10, 4, 1)).toBe(10); // a long frame does not overshoot
  });

  it('raises the gun on the aim side over a short blend and kicks the raised one', () => {
    const m = new CorgiMotion();
    expect(m.raised).toBe(0);
    m.step(0.05, 100, 14, 0, 420);
    expect(m.side).toBe(1);
    expect(m.raised).toBe(0); // mid-swap the left gun is still higher
    for (let i = 0; i < 4; i++) m.step(0.05, 100, 14, 0, 420);
    expect(m.raised).toBe(1);
    expect(m.weight(1)).toBe(1);
    expect(m.fire()).toBe(1);
    expect(m.recoil).toEqual([0, 1]);
    m.step(0.1, 100, 14, 0, 420);
    expect(m.recoil[1]).toBeCloseTo(0.3);
  });

  it('leans into the run up to 3°', () => {
    const m = new CorgiMotion();
    for (let i = 0; i < 30; i++) m.step(1 / 30, -100, 14, 420, 420);
    expect(m.lean).toBeCloseTo(3, 1);
    for (let i = 0; i < 30; i++) m.step(1 / 30, -100, 14, -2000, 420);
    expect(m.lean).toBeCloseTo(-3, 1);
  });
});
