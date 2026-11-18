import { describe, expect, it } from 'vitest';
import { ARENA } from './arena';
import { Bot } from './bot/bot';
import { DEFAULT_RUN, type RunConfig } from './config';
import { Engine } from './Engine';
import type { SimEvent } from './events';
import { hashState } from './hash';
import { LocalInputSource, ReplayInputSource, type PlayerCommand } from './input';
import { asKick, KICK } from './kick';
import { toFp } from './math/fixed';
import { newMob } from './state';
import { downMob } from './systems/combat';

// The Holy Kick prototype (kick.ts, systems/holyKick.ts): the charge, the kick, the chain, the wall.

const SANDBOX: RunConfig = { ...DEFAULT_RUN, seed: 5, mobs: 0, elite: false, boss: false, kick: true };
const cmd = (tick: number, kick = false): PlayerCommand => ({ owner: 0, tick, moveBrad: 0, moveMag: 0, ...(kick ? { kick } : {}) });

/** A sandbox kick run with mobs of health 1 at these x (units) on the hero's line, and a full charge. */
function lineUp(xs: number[], config: RunConfig = SANDBOX): Engine {
  const e = new Engine(config);
  for (const x of xs) e.state.mobs.push(newMob(toFp(x), 0, 1));
  e.state.players[0].charge = KICK.full;
  return e;
}

/** Steps until the kick's last body is down; every event on the way. */
function play(e: Engine, kick = true): SimEvent[] {
  const all = [...e.step([cmd(e.nextTick, kick)])];
  for (let k = 0; k < 120 && (e.state.flyers!.length > 0 || e.state.players[0].chain); k++) all.push(...e.step([cmd(e.nextTick)]));
  return all;
}

describe('holy kick', () => {
  it('leaves every other run as it was', () => {
    const s = new Engine({ ...SANDBOX, kick: undefined }).state;
    expect('flyers' in s).toBe(false);
    expect('charge' in s.players[0]).toBe(false);
  });

  it('fills the charge with kills and says so once, but not with kills by the kick', () => {
    const e = lineUp(Array.from({ length: KICK.full + 3 }, (_, k) => 2000 + 10 * k));
    const p = e.state.players[0];
    p.charge = 0;
    const events: SimEvent[] = [];
    for (let i = 0; i < KICK.full + 2; i++) downMob(e.state, events, i, p, false);
    expect(p.charge).toBe(KICK.full);
    expect(events.filter((v) => v.type === 'kickReady')).toHaveLength(1);
    p.charge = 0;
    asKick(() => downMob(e.state, events, 0, p, false));
    expect(p.charge).toBe(0);
  });

  it('does nothing until the charge is full', () => {
    const e = lineUp([200]);
    e.state.players[0].charge = KICK.full - 1;
    const events = e.step([cmd(1, true)]);
    expect(events.some((v) => v.type === 'holyKick')).toBe(false);
    expect(e.state.flyers).toHaveLength(0);
    expect(e.state.players[0].charge).toBe(KICK.full - 1);
  });

  it('sends the kicked mob through a line of the horde, each one it fells flying on', () => {
    const e = lineUp([200, 450, 700, 950]);
    const events = play(e);
    const kick = events.find((v) => v.type === 'holyKick');
    expect(kick && kick.type === 'holyKick' && kick.dx > 0 && kick.dy === 0).toBe(true);
    const chain = events.filter((v) => v.type === 'kickChain');
    expect(chain.length).toBeGreaterThanOrEqual(3);
    const end = events.find((v) => v.type === 'kickEnd');
    expect(end && end.type === 'kickEnd' && end.n).toBe(chain.length);
    // the kick's own kills leave the charge empty
    expect(e.state.players[0].charge).toBe(0);
    expect(e.state.flyers).toHaveLength(0);
  });

  it('keeps a chain to KICK.bodies however long the line', () => {
    const e = lineUp(Array.from({ length: 200 }, (_, k) => 150 + 40 * k));
    const events = play(e);
    const end = events.find((v) => v.type === 'kickEnd');
    expect(end && end.type === 'kickEnd' && end.n).toBe(KICK.bodies);
  });

  it('bursts on an arena wall', () => {
    const lim = (ARENA.half - ARENA.inset) / 1000;
    const e = lineUp([lim - 300], { ...SANDBOX, arena: true });
    e.state.players[0].x = toFp(lim - 500);
    const events = play(e);
    const burst = events.find((v) => v.type === 'kickBurst');
    expect(burst && burst.type === 'kickBurst' && burst.wall).toBe(true);
  });

  it('replays a run with kicks bit for bit', () => {
    const config: RunConfig = { ...DEFAULT_RUN, seed: 9, waves: ARENA.waves, chapter: ARENA.chapter, revives: 0, arena: true, kick: true };
    const input = new LocalInputSource();
    const live = new Engine(config, input);
    const bot = new Bot(0, 'skilled', 3);
    let kicks = 0;
    for (let k = 0; k < 30 * 120 && live.state.outcome === 'playing'; k++) {
      const c = bot.command(live.state);
      live.submit(c);
      for (const v of live.advance()!) if (v.type === 'holyKick') kicks++;
    }
    expect(kicks).toBeGreaterThan(0);
    const again = new Engine(config, new ReplayInputSource(input.history));
    while (again.state.tick < live.state.tick) again.advance();
    expect(hashState(again.state)).toBe(hashState(live.state));
  });
});
