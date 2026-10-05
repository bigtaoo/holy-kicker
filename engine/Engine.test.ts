import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, type RunConfig } from './config';
import { Engine, ENGINE_VERSION, STEP_ORDER } from './Engine';
import { hashState } from './hash';
import { LocalInputSource, ReplayInputSource, quantizeMove, type PlayerCommand } from './input';

// The determinism contract: the same config and commands give the same state, bit for bit,
// however the run is driven (live, replayed, on another engine). The golden hash pins the
// rules themselves: if it changes, every recorded replay changes, so bump ENGINE_VERSION and
// record the new value on purpose.

/** A busy run: horde, elite, boss, enemy attacks and every spell. */
const BUSY: RunConfig = { ...DEFAULT_RUN, seed: 1234, mobs: 120, threats: true, spells: ['nova', 'meteor', 'field', 'chain'], spellRate: 2, drops: 50 };

/** The first waves of a chapter, with enemy attacks, so the hero takes real damage. */
const CHAPTER: RunConfig = { ...DEFAULT_RUN, seed: 77, waves: 50, threats: true };

/** Chapter 2: water ghosts rising next to the hero, toads spitting bullet fans, the toad king on wave 10. */
const MARSH: RunConfig = { ...DEFAULT_RUN, seed: 78, waves: 50, chapter: 2 };
const SNOW: RunConfig = { ...MARSH, chapter: 3 };
const GHOST: RunConfig = { ...MARSH, chapter: 4 };
const PEAK: RunConfig = { ...MARSH, chapter: 5 };
/** Hard mode on chapter 5: HARD's health and hurt, and three elites on wave 10. */
const HARD_PEAK: RunConfig = { ...PEAK, hard: true };
/** The other monks: their stats and passives (systems/monks.ts). */
const FAT: RunConfig = { ...SNOW, monk: 'fat' };
const NOVICE: RunConfig = { ...SNOW, monk: 'novice' };

/** A scripted stick: circles, stops and dashes, the same for every run; takes any level-up card. */
function stick(tick: number, owner = 0): PlayerCommand {
  const phase = Math.floor(tick / 45) % 4;
  const a = tick * 0.05;
  const [x, y] = phase === 0 ? [Math.cos(a), Math.sin(a)] : phase === 1 ? [0, 0] : phase === 2 ? [1, 0.2] : [-0.5, -0.8];
  return { owner, tick, ...quantizeMove(x, y), pick: tick % 3 };
}

function run(config: RunConfig, ticks: number, every = 30): { engine: Engine; hashes: number[] } {
  const engine = new Engine(config);
  const hashes: number[] = [];
  for (let t = 1; t <= ticks; t++) {
    for (let o = 0; o < config.players; o++) engine.submit(stick(t, o));
    engine.advance();
    if (t % every === 0) hashes.push(hashState(engine.state));
  }
  return { engine, hashes };
}

describe('Engine', () => {
  it('gives the same states for the same config and commands', () => {
    const a = run(BUSY, 600);
    const b = run(BUSY, 600);
    expect(b.hashes).toEqual(a.hashes);
    // and the run really did things
    const s = a.engine.state;
    expect(s.players[0].xp).toBeGreaterThan(0);
    expect(s.tick).toBe(600);
  });

  it('replays a recorded run to the same state', () => {
    const live = run(BUSY, 450);
    const history = (live.engine.input as LocalInputSource).history;
    const replay = new Engine(BUSY, new ReplayInputSource(history));
    for (let t = 0; t < 450; t++) replay.advance();
    expect(hashState(replay.state)).toBe(hashState(live.engine.state));
  });

  it('differs with the seed', () => {
    expect(run({ ...BUSY, seed: 99 }, 90).hashes).not.toEqual(run(BUSY, 90).hashes);
  });

  it('holds the last command for a player who sent none', () => {
    const e = new Engine({ ...DEFAULT_RUN, mobs: 0, elite: false, boss: false });
    e.submit({ owner: 0, tick: 1, ...quantizeMove(1, 0) });
    for (let t = 0; t < 10; t++) e.advance();
    expect(e.state.players[0].x).toBeGreaterThan(9 * 1300);
  });

  it('does not care in which order commands of one tick arrive', () => {
    const cfg = { ...BUSY, players: 2 };
    const a = new Engine(cfg);
    const b = new Engine(cfg);
    for (let t = 1; t <= 120; t++) {
      a.step([stick(t, 0), stick(t + 7, 1)].map((c) => ({ ...c, tick: t })));
      b.step([stick(t + 7, 1), stick(t, 0)].map((c) => ({ ...c, tick: t })));
    }
    expect(hashState(b.state)).toBe(hashState(a.state));
  });

  it('keeps the state integer-only (the hash throws on a float)', () => {
    const { engine } = run(BUSY, 120);
    engine.state.players[0].x += 0.5;
    expect(() => hashState(engine.state)).toThrow(/non-integer/);
  });

  it('matches the golden hashes for this engine version', () => {
    // Recorded 2026-10-05 for ENGINE_VERSION 28 (the monks). A change here is a rules change: bump the version.
    expect(ENGINE_VERSION).toBe(28);
    expect(run(BUSY, 900, 900).hashes[0]).toBe(GOLDEN);
    expect(run(CHAPTER, 1800, 1800).hashes[0]).toBe(GOLDEN_CHAPTER);
    expect(run(MARSH, 4800, 4800).hashes[0]).toBe(GOLDEN_MARSH);
    expect(run(SNOW, 4800, 4800).hashes[0]).toBe(GOLDEN_SNOW);
    expect(run(GHOST, 4800, 4800).hashes[0]).toBe(GOLDEN_GHOST);
    expect(run(PEAK, 4800, 4800).hashes[0]).toBe(GOLDEN_PEAK);
    expect(run(HARD_PEAK, 4800, 4800).hashes[0]).toBe(GOLDEN_HARD);
    expect(GOLDEN_HARD).not.toBe(GOLDEN_PEAK);
    expect(run(FAT, 4800, 4800).hashes[0]).toBe(GOLDEN_FAT);
    expect(run(NOVICE, 4800, 4800).hashes[0]).toBe(GOLDEN_NOVICE);
  });

  it('plays a chapter the same way twice', () => {
    const a = run(CHAPTER, 1200);
    expect(run(CHAPTER, 1200).hashes).toEqual(a.hashes);
    expect(a.engine.state.wave).toBeGreaterThan(1);
    expect(a.engine.state.players[0].level).toBeGreaterThan(1);
  });

  it('steps the systems in the documented order', () => {
    expect(STEP_ORDER).toEqual(['input', 'movePlayers', 'horde', 'emerge', 'elite', 'boss', 'shots', 'kicks', 'balls', 'rings', 'beads', 'bowls', 'spells', 'threats', 'contact', 'drops', 'build', 'waves', 'spawns']);
  });
});

const GOLDEN = 1010763723;
const GOLDEN_CHAPTER = 1719824153;
const GOLDEN_MARSH = 847737016;
const GOLDEN_SNOW = 2330683014;
const GOLDEN_GHOST = 2760094641;
const GOLDEN_PEAK = 675144953;
const GOLDEN_HARD = 3400573475;
const GOLDEN_FAT = 2922641654;
const GOLDEN_NOVICE = 3160508817;
