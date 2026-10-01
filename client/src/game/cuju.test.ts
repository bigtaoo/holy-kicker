import { describe, expect, it } from 'vitest';
import { launch, nearest, stepBall, type BallParams } from './cuju';

const p: BallParams = { speed: 100, hitRadius: 10, seekRange: 300, maxHits: 2, maxTravel: 500 };

describe('nearest', () => {
  it('picks the closest mob in range and honours skip', () => {
    const mobs = [{ x: 50, y: 0 }, { x: 20, y: 0 }, { x: 500, y: 0 }];
    expect(nearest(mobs, 0, 0, 100)).toBe(1);
    expect(nearest(mobs, 0, 0, 100, 1)).toBe(0);
    expect(nearest(mobs, 0, 0, 10)).toBe(-1);
  });
});

describe('stepBall', () => {
  it('hits, ricochets to the next mob, and dies after maxHits', () => {
    const mobs = [{ x: 100, y: 0 }, { x: 100, y: 200 }];
    const ball = launch(0, 0, 100, 0, p);
    let hit = -1;
    for (let i = 0; i < 20 && hit < 0; i++) hit = stepBall(ball, mobs, 0.1, p);
    expect(hit).toBe(0);
    expect(ball.alive).toBe(true);
    expect(ball.vy).toBeCloseTo(100); // now heading down to the second mob
    hit = -1;
    for (let i = 0; i < 30 && hit < 0; i++) hit = stepBall(ball, mobs, 0.1, p);
    expect(hit).toBe(1);
    expect(ball.alive).toBe(false);
  });

  it('drops dead after maxTravel without a hit', () => {
    const ball = launch(0, 0, 1, 0, p);
    for (let i = 0; i < 60; i++) stepBall(ball, [], 0.1, p);
    expect(ball.alive).toBe(false);
  });
});
