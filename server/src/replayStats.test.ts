import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, Engine, hashState, newMob, replayEngine, takeReplay, type LocalInputSource, type RunConfig } from '@hk/engine';
import { Bot } from '@hk/engine/bot/bot';
import { analyzeRun, hordeAround } from './replayStats';
import { formatBuilds, formatPicks, formatRun, formatTable } from './replayReport';

// A bot's run, taken as a replay and read back: the reading agrees with what the live run counted.

const CONFIG: RunConfig = { ...DEFAULT_RUN, seed: 777, waves: 50, revives: 0 };

function botRun(ticks: number) {
  const engine = new Engine(CONFIG);
  const bot = new Bot(0, 'casual', CONFIG.seed);
  let kills = 0, picks = 0, damage = 0;
  while (engine.state.tick < ticks && engine.state.outcome === 'playing') {
    engine.submit(bot.command(engine.state));
    for (const ev of engine.advance() ?? []) {
      if (ev.type === 'mobDown' || ev.type === 'eliteDown' || ev.type === 'bossDown') kills++;
      else if (ev.type === 'pick') picks++;
      else if (ev.type === 'hurt') damage += ev.value;
    }
  }
  return { replay: takeReplay(engine, (engine.input as LocalInputSource).history), kills, picks, damage, level: engine.state.players[0].level };
}

describe('replay stats', () => {
  const live = botRun(3 * 60 * 30);
  const engine = replayEngine(live.replay);
  const r = analyzeRun(engine, live.replay.tick);

  it('steps the replay to its end and counts what the live run counted', () => {
    expect(hashState(engine.state)).toBe(live.replay.hash);
    expect(r.kills).toBe(live.kills);
    expect(r.picks.length).toBe(live.picks);
    expect(Object.values(r.damage).reduce((a, b) => a + b, 0)).toBe(live.damage);
    expect(r.level).toBe(live.level);
  });

  it('has a row per wave, back to back, adding up to the run', () => {
    expect(r.waves.map((w) => w.wave)).toEqual(r.waves.map((_, i) => i + 1));
    expect(r.waves.reduce((a, w) => a + w.kills, 0)).toBe(r.kills);
    for (const w of r.waves) expect(w.onScreen).toBeGreaterThanOrEqual(0);
  });

  it('records each offer with the card taken from it', () => {
    for (const p of r.picks) expect(p.offered).toContain(p.took);
  });

  it('formats without throwing', () => {
    const m = { id: 'test', tags: ['web'], chapter: 1, relic: 'ball', monk: 'kicker', engine: 0, hashOk: true, note: '' };
    expect(formatRun(m, r).length).toBeGreaterThan(4);
    expect(formatTable([{ m, r }])).toHaveLength(2);
    expect(formatPicks([{ m, r }]).length).toBeGreaterThan(1);
  });

  it('reads the final build and tallies it per card, with and without', () => {
    const p = engine.state.players[0];
    expect(r.build.spells).toEqual(p.spells.map((sp) => ({ id: sp.id, level: sp.level, evolved: sp.evolved })));
    expect(r.build.relicLv).toBe(p.relic);
    const m = { id: 'test', tags: [], chapter: 1, relic: 'ball', monk: 'kicker', engine: 0, hashOk: true, note: '' };
    const won = { ...r, outcome: 'won', build: { ...r.build, spells: [{ id: 'palm', level: 5, evolved: true }], passives: [{ id: 'eye', level: 2 }] } };
    const lost = { ...r, outcome: 'lost', wave: 10, build: { ...r.build, spells: [{ id: 'bolt', level: 3, evolved: false }], passives: [] } };
    const rows = formatBuilds([{ m, r: won }, { m, r: lost }]);
    expect(rows.find((l) => l.includes('evolve:palm'))).toMatch(/evolve:palm\s+1\s+1\s+100%/);
    expect(rows.find((l) => l.includes('spell:bolt'))).toMatch(/spell:bolt\s+1\s+0\s+0%\s+10 \|\s+1\s+100%/);
  });
});

describe('the horde around the hero', () => {
  const state = (points: [number, number][]) => {
    const e = new Engine({ ...DEFAULT_RUN, seed: 1, waves: 0, mobs: 0, elite: false, boss: false });
    for (const [x, y] of points) e.state.mobs.push(newMob(x * 1000, y * 1000, 5));
    return e.state;
  };

  it('calls a horde in one patch clumped, and one spread over the screen not', () => {
    const clumped = state(Array.from({ length: 20 }, (_, i) => [300 + (i % 5) * 20, 300 + Math.floor(i / 5) * 20]));
    expect(hordeAround(clumped, 0, 0, 0, 0).clump).toBe(100);
    const spread = state(Array.from({ length: 20 }, (_, i) => [-450 + (i % 5) * 220, -650 + Math.floor(i / 5) * 320]));
    expect(hordeAround(spread, 0, 0, 0, 0).clump).toBeLessThan(30);
  });

  it('counts the sides of the hero mobs stand on, and those behind him as he runs', () => {
    const ring = state(Array.from({ length: 8 }, (_, i) => [Math.round(200 * Math.cos((i + 0.5) * Math.PI / 4)), Math.round(200 * Math.sin((i + 0.5) * Math.PI / 4))]));
    const h = hordeAround(ring, 0, 0, 1000, 0);
    expect(h.sectors).toBe(8);
    expect(h.near).toBe(8);
    expect(h.behind).toBe(4);
  });

  it('leaves out what is off the screen', () => {
    expect(hordeAround(state([[2000, 0], [0, 900]]), 0, 0, 0, 0).onScreen).toBe(0);
  });
});
