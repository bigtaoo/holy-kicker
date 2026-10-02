import { DEFAULT_RUN, type RunConfig } from '../config';
import type { RelicId } from '../content';
import { Engine } from '../Engine';
import { TICK_RATE } from '../math/fixed';
import { Bot, type BotStyle } from './bot';

// The balance report: bots play whole chapters over many seeds and the numbers that tell how
// hard it is come out per run and summed up (build/balance.mjs prints them). No revives, so a
// run ends at the first death; `diedAt` is the wave that killed the hero.

export interface RunStats {
  seed: number;
  style: BotStyle;
  outcome: 'won' | 'lost' | 'timeout';
  wave: number;
  seconds: number;
  level: number;
  /** Health at the start of every tenth wave (1, 11, 21, ...), as a percent of max. */
  hpAt: number[];
  /** Health lost in total, and the blows the bell took. */
  hurt: number;
  blocked: number;
  kills: number;
  /** Seconds each elite, the mid-boss and the boss lived (null if it never fell). */
  elites: (number | null)[];
  bosses: (number | null)[];
  build: string;
}

/** Plays one chapter with a bot; stops at the first death or after `maxMinutes`. */
export function playChapter(seed: number, style: BotStyle, waves = 50, maxMinutes = 30, relic: RelicId = 'ball'): RunStats {
  const config: RunConfig = { ...DEFAULT_RUN, seed, waves, revives: 0, relic };
  const e = new Engine(config);
  const s = e.state;
  const bot = new Bot(0, style, seed);
  const stats: RunStats = {
    seed, style, outcome: 'timeout', wave: 1, seconds: 0, level: 1, hpAt: [100], hurt: 0, blocked: 0, kills: 0,
    elites: [], bosses: [], build: '',
  };
  let eliteFrom = -1;
  let bossFrom = -1;
  const limit = maxMinutes * 60 * TICK_RATE;
  while (s.outcome === 'playing' && s.tick < limit) {
    if (s.elite && eliteFrom < 0) eliteFrom = s.tick;
    if (s.boss && s.boss.phase !== 'down' && bossFrom < 0) bossFrom = s.tick;
    for (const ev of e.step([bot.command(s)])) {
      if (ev.type === 'hurt') stats.hurt += ev.value;
      else if (ev.type === 'bellBreak') stats.blocked++;
      else if (ev.type === 'mobDown') stats.kills++;
      else if (ev.type === 'eliteDown') {
        stats.elites.push(secs(s.tick - eliteFrom));
        eliteFrom = -1;
      } else if (ev.type === 'bossDown') {
        stats.bosses.push(secs(s.tick - bossFrom));
        bossFrom = -1;
      } else if (ev.type === 'wave' && ev.wave % 10 === 1) {
        const p = s.players[0];
        stats.hpAt.push(Math.trunc((p.hp * 100) / p.maxHp));
      }
    }
  }
  // an elite or boss still standing at the end counts as never felled
  if (eliteFrom >= 0) stats.elites.push(null);
  if (bossFrom >= 0) stats.bosses.push(null);
  const p = s.players[0];
  stats.outcome = s.outcome === 'playing' ? 'timeout' : s.outcome;
  stats.wave = s.wave;
  stats.seconds = secs(s.tick);
  stats.level = p.level;
  stats.build = [
    `${p.relicId}${p.relic}${p.awakened ? '*' : ''}`,
    ...p.spells.map((sp) => `${sp.id}${sp.level}${sp.evolved ? '*' : ''}`),
    ...p.passives.map((ps) => `${ps.id}${ps.level}`),
  ].join(' ');
  return stats;
}

function secs(t: number): number {
  return Math.trunc(t / TICK_RATE);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const v = [...xs].sort((a, b) => a - b);
  return v[v.length >> 1];
}

/** Runs `runs` seeds per style and returns the report as text lines. */
export function balanceReport(
  runs: number, styles: readonly BotStyle[] = ['skilled', 'casual', 'still'], waves = 50, relic: RelicId = 'ball',
): string[] {
  const out: string[] = [];
  for (const style of styles) {
    const all: RunStats[] = [];
    out.push(`== ${style} (${relic}) ==`);
    for (let seed = 1; seed <= runs; seed++) {
      const r = playChapter(seed, style, waves, 30, relic);
      all.push(r);
      const t = (xs: (number | null)[]) => xs.map((x) => (x === null ? '-' : `${x}s`)).join('/');
      out.push(
        `seed ${String(seed).padStart(2)}  ${r.outcome.padEnd(7)} wave ${String(r.wave).padStart(2)}  ` +
          `${Math.trunc(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}  lv ${String(r.level).padStart(2)}  ` +
          `hp ${r.hpAt.join('/')}  hurt ${r.hurt} bell ${r.blocked}  elites ${t(r.elites)}  bosses ${t(r.bosses)}  | ${r.build}`,
      );
    }
    const won = all.filter((r) => r.outcome === 'won').length;
    out.push(
      `-- won ${won}/${all.length}, median wave ${median(all.map((r) => r.wave))}, ` +
        `median level ${median(all.map((r) => r.level))}, median time ${median(all.map((r) => r.seconds))}s`,
    );
  }
  return out;
}
