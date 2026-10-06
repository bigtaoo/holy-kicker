import { WAVES, type RunConfig } from './config';
import { Engine, ENGINE_VERSION } from './Engine';
import { hashState } from './hash';
import { ReplayInputSource, type PlayerCommand } from './input';

// A run as a replay: the config and the commands, enough to play it again tick for tick (the
// sim is deterministic). Sent with a problem report, so the run can be watched or stepped
// through where it went wrong. The commands are packed: a player without a command holds the
// last, so only the ones that change something are kept, as flat numbers for compact JSON.

export interface Replay {
  /** ENGINE_VERSION it was recorded with; another version plays it differently. */
  engine: number;
  config: RunConfig;
  /** The wave a dev run started on (?wave=N, set after the engine was built); 1 normally. */
  wave: number;
  /** Per kept command: tick, owner, moveBrad, moveMag and flags (1 revive, 2 + 4 * card picked). */
  cmds: number[];
  /** The tick it was taken on, and hashState then, to check a playback. */
  tick: number;
  hash: number;
}

/** Numbers per packed command. */
export const PACKED = 5;

/** The commands that change something: a new move, a revive or a pick. */
export function packCommands(history: readonly PlayerCommand[]): number[] {
  const out: number[] = [];
  const last = new Map<number, [number, number]>();
  for (const c of history) {
    const flags = (c.revive ? 1 : 0) | (c.pick !== undefined ? 2 + 4 * c.pick : 0);
    const was = last.get(c.owner);
    if (flags === 0 && was && was[0] === c.moveBrad && was[1] === c.moveMag) continue;
    last.set(c.owner, [c.moveBrad, c.moveMag]);
    out.push(c.tick, c.owner, c.moveBrad, c.moveMag, flags);
  }
  return out;
}

export function unpackCommands(cmds: readonly number[]): PlayerCommand[] {
  const out: PlayerCommand[] = [];
  for (let i = 0; i + PACKED <= cmds.length; i += PACKED) {
    const [tick, owner, moveBrad, moveMag, flags] = cmds.slice(i, i + PACKED);
    const c: PlayerCommand = { owner, tick, moveBrad, moveMag };
    if (flags & 1) c.revive = true;
    if (flags & 2) c.pick = flags >> 2;
    out.push(c);
  }
  return out;
}

/** The replay of `engine`'s run so far (its input must have kept a history). */
export function takeReplay(engine: Engine, history: readonly PlayerCommand[], wave = 1): Replay {
  const s = engine.state;
  return { engine: ENGINE_VERSION, config: s.config, wave, cmds: packCommands(history.filter((c) => c.tick <= s.tick)), tick: s.tick, hash: hashState(s) };
}

/** A new engine that will play `r` back; step it with advance() up to r.tick. */
export function replayEngine(r: Replay): Engine {
  const e = new Engine(r.config, new ReplayInputSource(unpackCommands(r.cmds)));
  if (r.wave > 1) {
    e.state.wave = r.wave - 1;
    e.state.waveT = WAVES.ticks - 1;
  }
  return e;
}

/** Plays `r` to its tick; whether it ends where the recording did (same version and hash). */
export function checkReplay(r: Replay): boolean {
  if (r.engine !== ENGINE_VERSION) return false;
  const e = replayEngine(r);
  while (e.state.tick < r.tick) e.advance();
  return hashState(e.state) === r.hash;
}
