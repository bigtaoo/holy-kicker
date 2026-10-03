import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, type RunConfig } from '../config';
import { FISH, FISH_AWAKENED, FISH_LEVELS, MAX_LEVEL } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { newMob } from '../state';
import { cardPool, evolutions } from './build';

// The wooden fish relic (docs/content.md "Relics"): a sound ring that grows out from the hero
// and hits everything it passes once, and the Stunning Bell's stunning fourth ring.

const FISH_RUN: RunConfig = { ...DEFAULT_RUN, waves: 50, relic: 'fish' };

function cmd(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A fish chapter with the horde gone and the hero untouchable. */
function quiet(): Engine {
  const e = new Engine(FISH_RUN);
  e.state.mobs.length = 0;
  e.state.elites.length = 0;
  e.state.players[0].hurtCd = 1e6;
  return e;
}

function steps(e: Engine, n: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...e.step([cmd(e)]));
  return all;
}

function hits(events: SimEvent[]): number[] {
  return events.flatMap((v) => (v.type === 'hit' ? [v.index] : [])).sort();
}

describe('wooden fish', () => {
  it('sends a ring all round that hits each enemy in reach once, the near ones first', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    const reach = FISH_LEVELS[0].reach;
    // one close in front, one behind near the edge, one out of reach
    s.mobs.push(newMob(p.x + 150_000, p.y, 1e9), newMob(p.x - reach + 20_000, p.y, 1e9), newMob(p.x, p.y + reach + 100_000, 1e9));
    const events = steps(e, 20);
    expect(events.filter((v) => v.type === 'ring')).toEqual([{ type: 'ring', owner: 0, x: p.x, y: p.y, reach, stun: false }]);
    expect(hits(events)).toEqual([0, 1]);
    // the far one is hit later, when the ring gets there
    const first = events.findIndex((v) => v.type === 'hit');
    expect(events[first]).toMatchObject({ index: 0 });
    expect(s.rings.length).toBe(0);
    expect(s.balls.length).toBe(0);
    // nothing is knocked back: it only walked in
    expect(s.mobs[0].x).toBeLessThan(p.x + 150_000);
  });

  it('waits until a target is well inside the reach', () => {
    const e = quiet();
    const p = e.state.players[0];
    e.state.mobs.push(newMob(p.x, p.y - FISH_LEVELS[0].reach, 1e9));
    expect(steps(e, 3).some((v) => v.type === 'kick')).toBe(false);
  });

  it('awakened, every fourth ring stuns the mobs it passes', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.relic = MAX_LEVEL;
    p.awakened = true;
    s.mobs.push(newMob(p.x + FISH_AWAKENED.reach - 60_000, p.y, 1e9));
    const rings: SimEvent[] = [];
    let stunnedAt = -1;
    for (let t = 0; t < 200 && stunnedAt < 0; t++) {
      for (const v of steps(e, 1)) if (v.type === 'ring') rings.push(v);
      if (s.mobs[0].stun > 0) stunnedAt = s.tick;
    }
    expect(rings.map((v) => v.type === 'ring' && v.stun)).toEqual([false, false, false, true]);
    expect(s.mobs[0].stun).toBe(FISH.stun);
    // a stunned mob does not move toward the hero
    const x = s.mobs[0].x;
    steps(e, 5);
    expect(s.mobs[0].x).toBe(x);
    steps(e, FISH.stun);
    expect(s.mobs[0].x).toBeLessThan(x);
  });

  it('levels with the cards and awakens with Calm Mind', () => {
    const e = quiet();
    const p = e.state.players[0];
    expect(cardPool(p)[0]).toEqual({ kind: 'relic', id: 'fish' });
    p.relic = MAX_LEVEL;
    p.passives = [{ id: 'calm', level: 1 }];
    expect(evolutions(p)).toEqual([{ kind: 'evolve', id: 'fish' }]);
    p.offer = evolutions(p);
    e.step([{ ...cmd(e), pick: 0 }]);
    expect(p.awakened).toBe(true);
  });
});
