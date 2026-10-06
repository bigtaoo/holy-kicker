import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, ELITE, HORDE, HURT, WAVES, type RunConfig } from '../config';
import { Engine } from '../Engine';
import { Prng } from '../math/prng';
import { atan2B } from '../math/trig';
import { body, newPlayer } from '../state';
import { respawnPoint } from './horde';
import { waveFoeHp } from './waves';

// The pressure on a hero who runs off or stands in the horde, and the elites' health curve.

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50 };

/** Angle from a to b in brads, signed into -32768..32767. */
function turn(a: number, b: number): number {
  return ((b - a + 32768) & 65535) - 32768;
}

describe('respawn ahead', () => {
  it('brings mobs back ahead of a running hero, and all round a hero who stands', () => {
    const rand = new Prng(7);
    const p = newPlayer(0, 0, 0);
    p.moving = true;
    p.moveBrad = 16384;
    const m = body(0, 0);
    let behind = 0;
    for (let i = 0; i < 200; i++) {
      respawnPoint(rand, p, m);
      const a = atan2B(m.y - p.y, m.x - p.x);
      expect(Math.abs(turn(p.moveBrad, a))).toBeLessThanOrEqual(HORDE.aheadArc + 64);
    }
    p.moving = false;
    for (let i = 0; i < 200; i++) {
      respawnPoint(rand, p, m);
      if (Math.abs(turn(p.moveBrad, atan2B(m.y - p.y, m.x - p.x))) > 16384) behind++;
    }
    expect(behind).toBeGreaterThan(50);
  });
});

describe('crowd blows', () => {
  function blow(pressing: number): number {
    const e = new Engine(CHAPTER);
    const s = e.state;
    const p = s.players[0];
    s.mobs.forEach((m, i) => {
      m.x = p.x + 5_000_000 + i * 200_000;
      m.y = p.y;
    });
    // the first on the hero, the rest in a tight block beside him (all within HURT.crowdDist)
    for (let i = 0; i <= pressing; i++) {
      s.mobs[i].x = p.x + 1000 + (i % 3) * 30_000;
      s.mobs[i].y = p.y + Math.trunc(i / 3) * 30_000;
    }
    for (const ev of e.step([{ owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 }])) if (ev.type === 'hurt') return ev.value;
    return 0;
  }

  it('hurts more for every mob pressing in, up to a cap', () => {
    expect(blow(0)).toBe(HURT.mob);
    expect(blow(2)).toBe(Math.trunc((HURT.mob * (100 + 2 * HURT.crowdPercent)) / 100));
    expect(blow(HURT.crowdMax + 3)).toBe(Math.trunc((HURT.mob * (100 + HURT.crowdMax * HURT.crowdPercent)) / 100));
  });
});

describe('elite health by wave', () => {
  it('is softer early and tougher late, the listed health on the reference wave', () => {
    expect(waveFoeHp(ELITE.hp, 1, WAVES.foeHpWave, false)).toBe(ELITE.hp);
    expect(waveFoeHp(ELITE.hp, 1, 5, false)).toBeLessThan(ELITE.hp);
    expect(waveFoeHp(ELITE.hp, 1, 45, false)).toBeGreaterThan(ELITE.hp);
    const e = new Engine(CHAPTER);
    e.state.wave = 4;
    e.state.waveT = WAVES.ticks - 1;
    e.step([{ owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 }]);
    expect(e.state.wave).toBe(WAVES.eliteEvery);
    expect(e.state.elites.map((x) => x.hp)).toEqual([waveFoeHp(ELITE.hp, 1, WAVES.eliteEvery, false)]);
  });
});
