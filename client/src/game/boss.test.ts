import { describe, expect, it } from 'vitest';
import { BOSS, hurtBoss, newBoss, stepBoss, windupProgress } from './boss';

function run(b: ReturnType<typeof newBoss>, hx: number, hy: number, seconds: number) {
  const events = [];
  for (let t = 0; t < seconds; t += 0.01) {
    const e = stepBoss(b, hx, hy, 0.01);
    if (e) events.push(e);
  }
  return events;
}

describe('boss', () => {
  it('walks after the hero and stops short of him', () => {
    const b = newBoss(0, 0);
    b.cooldown = 99;
    run(b, 1000, 0, 20);
    expect(b.x).toBeCloseTo(1000 - BOSS.stopDist, 0);
    expect(b.y).toBeCloseTo(0);
  });

  it('slams only after the cooldown, on a circle aimed at the hero', () => {
    const b = newBoss(0, 0);
    expect(run(b, 300, 0, BOSS.cooldown - 0.1)).toEqual([]);
    const events = run(b, 300, 0, 0.2);
    expect(events).toEqual(['windup']);
    // the hero stands within reach, so the circle lands on him
    expect(b.zoneX).toBeCloseTo(300, 0);
    expect(b.zoneY).toBeCloseTo(0);
  });

  it('hits a hero who stays in the circle and misses one who leaves it', () => {
    const stay = newBoss(0, 0);
    stay.cooldown = 0;
    expect(run(stay, 200, 0, BOSS.windup + 0.05)).toEqual(['windup', 'slamHit']);

    const leave = newBoss(0, 0);
    leave.cooldown = 0;
    run(leave, 200, 0, 0.5);
    expect(windupProgress(leave)).toBeCloseTo(0.5, 1);
    expect(run(leave, 200, 600, 0.6)).toEqual(['slam']);
  });

  it('stands still while winding up and recovering, then walks again', () => {
    const b = newBoss(0, 0);
    b.cooldown = 0;
    run(b, 400, 0, 0.01);
    const x = b.x;
    run(b, 400, 0, BOSS.windup + BOSS.recover - 0.06);
    expect(b.x).toBe(x);
    expect(b.phase).toBe('recover');
    run(b, 400, 0, 0.1);
    expect(b.phase).toBe('walk');
    expect(b.cooldown).toBeGreaterThan(BOSS.cooldown - 0.1);
  });

  it('goes down once', () => {
    const b = newBoss(0, 0);
    expect(hurtBoss(b, BOSS.hp - 1)).toBe(false);
    expect(hurtBoss(b, 5)).toBe(true);
    expect(b.hp).toBe(0);
    expect(hurtBoss(b, 5)).toBe(false);
  });
});
