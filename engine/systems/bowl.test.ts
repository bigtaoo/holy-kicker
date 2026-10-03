import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, DROPS, type RunConfig } from '../config';
import { BOWL, BOWL_AWAKENED, BOWL_LEVELS, MAX_LEVEL, PASSIVES } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { dist } from '../math/fixed';
import { newElite, newMob, newPlayer } from '../state';
import { evolutions, gainXp, magnetOf } from './build';

// The alms bowl relic (docs/content.md "Relics"): thrown, it drags mobs out to its reach and
// comes back; the Bottomless Bowl swallows them for their experience. Also Karma, the passive
// it awakens with.

const BOWL_RUN: RunConfig = { ...DEFAULT_RUN, waves: 50, relic: 'bowl' };

function cmd(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A bowl chapter with the horde gone and the hero untouchable. */
function quiet(): Engine {
  const e = new Engine(BOWL_RUN);
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

/** Steps until the bowl is thrown and caught again (or `max` ticks). */
function oneThrow(e: Engine, max = 150): SimEvent[] {
  const all: SimEvent[] = [];
  let thrown = false;
  for (let i = 0; i < max; i++) {
    all.push(...steps(e, 1));
    if (e.state.bowls.length > 0) thrown = true;
    else if (thrown) break;
  }
  return all;
}

describe('alms bowl', () => {
  it('flies out to its reach, comes back and is caught; one in the air at a time', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    s.mobs.push(newMob(p.x + 300_000, p.y, 1e9));
    let far = 0;
    let most = 0;
    for (let i = 0; i < 150 && (s.bowls.length > 0 || far === 0); i++) {
      steps(e, 1);
      most = Math.max(most, s.bowls.length);
      for (const b of s.bowls) far = Math.max(far, dist(b.x - p.x, b.y - p.y));
    }
    expect(most).toBe(1);
    expect(s.bowls.length).toBe(0);
    expect(Math.abs(far - BOWL_LEVELS[0].reach)).toBeLessThanOrEqual(BOWL.speed);
  });

  it('hits a target on the way out and again on the way back', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    s.elites = [newElite(p.x + 300_000, p.y)];
    s.elites[0].hp = s.elites[0].maxHp = 1e9;
    s.elites[0].stun = 1e6;
    const events = oneThrow(e);
    expect(events.filter((v) => v.type === 'hit' && v.kind === 'elite').length).toBe(2);
  });

  it('drags the mobs it hits out to its reach and leaves them there', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    for (let k = 0; k < 5; k++) {
      s.mobs.push(newMob(p.x + 200_000, p.y + (k - 2) * 20_000, 1e9));
      s.mobs[k].stun = 1e6;
    }
    oneThrow(e);
    const out = s.mobs.filter((m) => dist(m.x - p.x, m.y - p.y) > 400_000).length;
    expect(out).toBe(BOWL_LEVELS[0].carry);
  });

  it('awakens with Karma into the Bottomless Bowl, which swallows mobs for their experience', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    p.relic = MAX_LEVEL;
    p.passives = [{ id: 'karma', level: 1 }];
    expect(evolutions(p)).toEqual([{ kind: 'evolve', id: 'bowl' }]);
    p.offer = evolutions(p);
    e.step([{ ...cmd(e), pick: 0 }]);
    expect(p.awakened).toBe(true);
    // far from the next level, so the experience does not stop the sim for a pick
    p.level = 50;
    for (let k = 0; k < 10; k++) {
      s.mobs.push(newMob(p.x + 250_000 + Math.trunc(k / 5) * 40_000, p.y + ((k % 5) - 2) * 15_000, 1e9));
      s.mobs[k].stun = 1e6;
    }
    const xp = p.xp;
    const events = oneThrow(e);
    const downs = events.filter((v) => v.type === 'mobDown').length;
    expect(downs).toBe(BOWL_AWAKENED.carry);
    // no gems: the experience came at once (Karma adds its share)
    expect(s.gems.length).toBe(0);
    expect(p.xp + p.xpPart / 100).toBeGreaterThanOrEqual(xp + downs);
  });
});

describe('Karma', () => {
  it('grows experience gains, carrying the fraction', () => {
    const p = newPlayer(0, 0, 0);
    p.passives = [{ id: 'karma', level: 1 }];
    for (let i = 0; i < 25; i++) gainXp(p, 1);
    expect(p.xp).toBe(Math.trunc((25 * (100 + PASSIVES.karma.perLevel)) / 100));
  });

  it('widens the gem magnet', () => {
    const p = newPlayer(0, 0, 0);
    expect(magnetOf(p)).toBe(DROPS.magnet);
    p.passives = [{ id: 'karma', level: 2 }];
    expect(magnetOf(p)).toBe(Math.trunc((DROPS.magnet * (100 + 2 * PASSIVES.karma.also!.perLevel)) / 100));
  });
});
