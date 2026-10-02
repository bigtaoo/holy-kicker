import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, type RunConfig } from '../config';
import { MAX_LEVEL, STAFF_AWAKENED, STAFF_LEVELS } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { newMob } from '../state';
import { cardPool, evolutions } from './build';

// The staff relic (docs/content.md "Relics"): a close sweep over the half circle toward the
// target, knockback, and the Ruyi Staff's full circle.

const STAFF_RUN: RunConfig = { ...DEFAULT_RUN, waves: 50, relic: 'staff' };

function cmd(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A staff chapter with the horde gone and the hero untouchable. */
function quiet(): Engine {
  const e = new Engine(STAFF_RUN);
  e.state.mobs.length = 0;
  e.state.players[0].hurtCd = 1e6;
  return e;
}

function steps(e: Engine, n: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...e.step([cmd(e)]));
  return all;
}

describe('staff', () => {
  it('sweeps the half circle toward its target, hitting each mob in reach once and knocking it back', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    const reach = STAFF_LEVELS[0].reach;
    // two in front (one nearest, the aim), one behind, one in front but out of reach
    s.mobs.push(newMob(p.x + 150_000, p.y, 1e9), newMob(p.x + 100_000, p.y + 200_000, 1e9));
    s.mobs.push(newMob(p.x - 200_000, p.y, 1e9), newMob(p.x + reach + 200_000, p.y, 1e9));
    const before = s.mobs.map((m) => m.x);
    const events = steps(e, 15);
    const sweeps = events.filter((v) => v.type === 'sweep');
    expect(sweeps.length).toBe(1);
    expect(sweeps[0]).toMatchObject({ full: false, reach });
    const hit = events.filter((v) => v.type === 'hit').map((v) => (v.type === 'hit' ? v.index : -1));
    expect(hit.sort()).toEqual([0, 1]);
    expect(s.mobs[0].x).toBeGreaterThan(before[0]);
    expect(events.some((v) => v.type === 'kick')).toBe(true);
    expect(s.balls.length).toBe(0);
  });

  it('awakened, sweeps all round with a longer reach', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.relic = MAX_LEVEL;
    p.awakened = true;
    const far = STAFF_AWAKENED.reach - 30_000;
    s.mobs.push(newMob(p.x + 150_000, p.y, 1e9), newMob(p.x - far, p.y, 1e9), newMob(p.x, p.y + far, 1e9));
    const events = steps(e, 15);
    expect(events.find((v) => v.type === 'sweep')).toMatchObject({ full: true });
    expect(events.filter((v) => v.type === 'hit').length).toBe(3);
  });

  it('levels and awakens like the cuju, with Iron Head', () => {
    const e = quiet();
    const p = e.state.players[0];
    expect(p.relicId).toBe('staff');
    expect(cardPool(p)[0]).toEqual({ kind: 'relic', id: 'staff' });
    p.relic = MAX_LEVEL;
    p.passives = [{ id: 'legs', level: 1 }];
    expect(evolutions(p)).toEqual([]);
    p.passives.push({ id: 'iron', level: 1 });
    expect(evolutions(p)).toEqual([{ kind: 'evolve', id: 'staff' }]);
    p.offer = evolutions(p);
    e.step([{ ...cmd(e), pick: 0 }]);
    expect(p.awakened).toBe(true);
  });
});
