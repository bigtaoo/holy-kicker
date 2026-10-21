import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, type RunConfig } from '../config';
import { EVOLVE, MAX_LEVEL } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { toFp } from '../math/fixed';
import { newMob, type Player } from '../state';

// The evolved talismans, cluster bomb and Blade Circle (systems/talismans.ts, bombs.ts, knives.ts).

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50 };

function quiet(): Engine {
  const e = new Engine(CHAPTER);
  e.state.mobs.length = 0;
  const p = e.state.players[0];
  p.hurtCd = 1e6;
  p.kickCd = 1e6;
  return e;
}

function steps(e: Engine, n: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    const c: PlayerCommand = { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
    all.push(...e.step([c]));
  }
  return all;
}

function learn(p: Player, id: 'talisman' | 'bomb' | 'knives', evolved: boolean): void {
  p.spells = [{ id, level: MAX_LEVEL, cd: 1, evolved }];
}

describe('evolved arsenal', () => {
  it('Heavenly Seal bursts where a talisman strikes and hits the mobs around', () => {
    for (const evolved of [false, true]) {
      const e = quiet();
      const s = e.state;
      const p = s.players[0];
      // one tough mob to strike and a ring of others close to it
      s.mobs.push(newMob(p.x + toFp(500), p.y, 1e9));
      for (let i = 0; i < 4; i++) s.mobs.push(newMob(p.x + toFp(500) + toFp(60) * (i % 2 ? 1 : -1), p.y + toFp(60) * (i < 2 ? 1 : -1), 1e9));
      learn(p, 'talisman', evolved);
      const events = steps(e, 60);
      const seals = events.filter((ev) => ev.type === 'seal');
      if (evolved) {
        expect(seals.length).toBeGreaterThan(0);
        expect(seals[0]).toMatchObject({ radius: EVOLVE.sealRadius });
      } else expect(seals).toHaveLength(0);
    }
  });

  it('Thunder Rain throws a bomb at each of the nearest enemies', () => {
    for (const evolved of [false, true]) {
      const e = quiet();
      const s = e.state;
      const p = s.players[0];
      for (let i = 0; i < 5; i++) s.mobs.push(newMob(p.x + toFp(300 + i * 100), p.y, 1e9));
      learn(p, 'bomb', evolved);
      const big = steps(e, 1).filter((ev) => ev.type === 'bomb' && !ev.small);
      expect(big).toHaveLength(evolved ? EVOLVE.bombVolley : 1);
      expect(new Set(big.map((b) => (b.type === 'bomb' ? b.x1 : 0))).size).toBe(big.length);
    }
  });

  it('Thousand Blades fly back to the circle and volley again', () => {
    for (const evolved of [false, true]) {
      const e = quiet();
      const s = e.state;
      const p = s.players[0];
      s.mobs.push(newMob(p.x + toFp(600), p.y, 1e9));
      learn(p, 'knives', evolved);
      // long enough to fill the circle, volley, and (evolved) fly home and volley again
      const events = steps(e, 30 * 8);
      const volleys = events.filter((ev) => ev.type === 'volley').length;
      expect(volleys).toBeGreaterThan(0);
      const flying = s.knives.filter((k) => k.flying);
      expect(flying.every((k) => k.returns === evolved)).toBe(true);
      expect(s.knives.length).toBeLessThanOrEqual(10);
      if (!evolved) continue;
      // every knife ever made is still around: none was lost on the way back
      expect(s.knives.length).toBe(10);
      expect(volleys).toBeGreaterThan(1);
      // the circle never holds two knives in one place
      const slots = s.knives.filter((k) => !k.flying).map((k) => k.slot);
      expect(new Set(slots).size).toBe(slots.length);
    }
  });
});
