import { DEFAULT_RUN, Engine, takeReplay, type LocalInputSource, type MonkId, type MutatorId, type RelicId, type RunConfig, type SutraId } from '@hk/engine';
import { Bot } from '@hk/engine/bot/bot';
import { LIMITS, type Challenge, type ReplayWire, type RunEntry } from './protocol';

// For the tests: a real run of a challenge, played by the balance bot.

export const INSTALL = 'abcdefgh1234';

/**
 * A real run of `c`: the bot plays on the challenge's seed with what a client would set up (a
 * weekly's loadout, else chapter 1 as the starting monk, and the challenge's mutator), and gives up after `ticks` (or falls
 * first). Returns the run and its replay as sent.
 */
export function playRun(c: Challenge, ticks = 2400, install = INSTALL): { run: RunEntry; replay: ReplayWire } {
  const l = c.loadout;
  const loadout: Partial<RunConfig> = l ? { relic: l.relic as RelicId, monk: l.monk as MonkId, sutras: l.sutras as SutraId[], chapter: l.chapter, bonus: {} } : {};
  const config: RunConfig = { ...DEFAULT_RUN, seed: c.seed, waves: c.waves, revives: 0, firstRun: false, mutator: c.mutator as MutatorId | null, ...loadout };
  return play(config, ticks, install);
}

/** A real chapter-1 run as a client sends it to the chapter boards: all the waves, one revive; the bot gives up after `ticks`. */
export function playChapter(ticks = 2400, install = INSTALL, seed = 99): { run: RunEntry; replay: ReplayWire } {
  return play({ ...DEFAULT_RUN, seed, waves: LIMITS.waves, revives: 1, firstRun: false, mutator: null, chapter: 1 }, ticks, install);
}

function play(config: RunConfig, ticks: number, install: string): { run: RunEntry; replay: ReplayWire } {
  const engine = new Engine(config);
  const s = engine.state;
  const bot = new Bot(0, 'casual', config.seed);
  while (s.outcome === 'playing' && s.tick < ticks) {
    engine.submit(bot.command(s));
    engine.advance();
  }
  const r = takeReplay(engine, (engine.input as LocalInputSource).history);
  const p = s.players[0];
  const run: RunEntry = {
    install, host: 'web', build: '0.0.1', chapter: config.chapter, hard: config.hard, won: s.outcome === 'won', wave: Math.max(1, s.wave),
    tenths: Math.round((s.tick * 10) / 30), level: p.level, kills: 0, monk: p.monk, relic: p.relicId,
  };
  return { run, replay: JSON.parse(JSON.stringify(r)) as ReplayWire };
}
