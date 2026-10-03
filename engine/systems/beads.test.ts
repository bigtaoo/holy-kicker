import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, type RunConfig } from '../config';
import { BEADS, BEADS_AWAKENED, BEADS_LEVELS, MAX_LEVEL } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { dist } from '../math/fixed';
import { newElite, newMob } from '../state';
import { cardPool, evolutions } from './build';

// The prayer beads relic (docs/content.md "Relics"): beads circling the hero that hit what
// they touch once per pass, and the 108 Beads' second ring turning the other way.

const BEADS_RUN: RunConfig = { ...DEFAULT_RUN, waves: 50, relic: 'beads' };

function cmd(e: Engine): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag: 0 };
}

/** A beads chapter with the horde gone and the hero untouchable. */
function quiet(): Engine {
  const e = new Engine(BEADS_RUN);
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

function hitsOn(events: SimEvent[], index: number): number {
  return events.filter((v) => v.type === 'hit' && v.index === index).length;
}

describe('prayer beads', () => {
  it('circle the hero at their orbit, as many as the level says', () => {
    const e = quiet();
    steps(e, 1);
    const s = e.state;
    const p = s.players[0];
    expect(s.beads.length).toBe(BEADS_LEVELS[0].count);
    for (const b of s.beads) expect(Math.abs(dist(b.x - p.x, b.y - p.y) - BEADS_LEVELS[0].orbit)).toBeLessThan(2000);
    // levelling adds a bead
    p.relic = 2;
    steps(e, 1);
    expect(s.beads.length).toBe(BEADS_LEVELS[1].count);
  });

  it('hit a target on the ring once per bead that passes, never kicking', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    // pressed against the hero, where the horde stands
    s.mobs.push(newMob(p.x + 70_000, p.y, 1e9));
    const lv = BEADS_LEVELS[0];
    const events = steps(e, lv.turn * 2);
    expect(events.some((v) => v.type === 'kick')).toBe(false);
    // two turns: each bead passes it twice (one more if a bead started on it)
    const n = hitsOn(events, 0);
    expect(n).toBeGreaterThanOrEqual(lv.count * 2);
    expect(n).toBeLessThanOrEqual(lv.count * 2 + 1);
  });

  it('miss what is beyond the ring', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    s.mobs.push(newMob(p.x + BEADS_LEVELS[0].orbit + BEADS.radius + 20_000, p.y, 1e9));
    s.mobs[0].stun = 1e6;
    expect(hitsOn(steps(e, 60), 0)).toBe(0);
  });

  it('do not knock the elite off the ring', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    s.elites = [newElite(p.x + 220_000, p.y)];
    s.elites[0].hp = s.elites[0].maxHp = 1e9;
    const events = steps(e, 60);
    expect(events.some((v) => v.type === 'hit' && v.kind === 'elite')).toBe(true);
    expect(dist(s.elites[0].x - p.x, s.elites[0].y - p.y)).toBeLessThanOrEqual(225_000);
  });

  it('awaken with Wisdom Eye into two rings turning opposite ways', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    expect(cardPool(p)[0]).toEqual({ kind: 'relic', id: 'beads' });
    p.relic = MAX_LEVEL;
    p.passives = [{ id: 'eye', level: 1 }];
    expect(evolutions(p)).toEqual([{ kind: 'evolve', id: 'beads' }]);
    p.offer = evolutions(p);
    e.step([{ ...cmd(e), pick: 0 }]);
    expect(p.awakened).toBe(true);
    steps(e, 1);
    expect(s.beads.length).toBe(BEADS_AWAKENED[0].count + BEADS_AWAKENED[1].count);
    const inner = s.beads.find((b) => b.ring === 0)!;
    const outer = s.beads.find((b) => b.ring === 1)!;
    const a0 = [inner.angle, outer.angle];
    steps(e, 1);
    const turn = (a: number, b: number) => ((b - a + 98304) % 65536) - 32768;
    expect(turn(a0[0], inner.angle)).toBeGreaterThan(0);
    expect(turn(a0[1], outer.angle)).toBeLessThan(0);
    expect(dist(outer.x - p.x, outer.y - p.y)).toBeGreaterThan(dist(inner.x - p.x, inner.y - p.y));
  });

  it('stop hitting while the hero is down', () => {
    const e = quiet();
    const s = e.state;
    const p = s.players[0];
    s.mobs.push(newMob(p.x + 150_000, p.y, 1e9));
    p.dead = true;
    expect(hitsOn(steps(e, 60), 0)).toBe(0);
  });
});
