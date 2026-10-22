import { ENGINE_VERSION, TICK_RATE } from '@hk/engine';
import { ahead, type Best, type NextRun } from './challengeDocs';
import { KNOWN_ENGINES } from './engines';
import { chapterConfig } from './resim';
import { runScore, type ReplayWire, type RunEntry } from './protocol';

// How chapter-board runs are kept, the same for both stores: one row per install per board with
// its best run. A new best counts only once re-simulated (resim.ts chapterConfig): it waits with
// its replay as the row itself (`pending`, shown on no board) or beside the shown best as `next`,
// so a refused run never costs the install the best it had. A run this server has no engine for
// (one queued across a deploy that bumped it past the engines bundled) is kept aside `stale`, never
// deleted or reported. Rows kept before the boards were checked carry no state and stay shown.

export interface BoardDoc extends Best {
  /**
   * Waiting for its re-simulation (`pending`), or kept with no engine to check it on (`stale`);
   * either is shown on no board. Absent once shown.
   */
  state?: 'pending' | 'stale';
  /** Re-simulated (absent on a row kept before the boards were checked). */
  verified?: true;
  /** The pending run's replay, dropped once verified. */
  replay?: ReplayWire;
  /** A better run waiting for its re-simulation beside the shown best. */
  next?: NextRun;
  /** A better run kept beside the shown best with no engine to check it on, inert (replaced by the next better run). */
  stale?: NextRun;
}

/** Whether the row shows on its board. */
export const shown = (d: BoardDoc) => d.state === undefined;

/** Whether the row has a run waiting for its re-simulation. */
export const boardWaiting = (d: BoardDoc) => d.state === 'pending' || d.next !== undefined;

/**
 * The replay if the server can verify `run` with it: made on an engine it has (`engines`) from
 * the first wave, as long as the run says, and on this engine a config the run could have had
 * (an older engine's config is checked at its re-simulation). Else null: the run is not kept.
 */
export function boardReplay(run: RunEntry, replay: ReplayWire | null, engines: readonly number[] = KNOWN_ENGINES): ReplayWire | null {
  if (!replay || !engines.includes(replay.engine) || replay.wave !== 1) return null;
  if (Math.round((replay.tick * 10) / TICK_RATE) !== run.tenths) return null;
  return replay.engine !== ENGINE_VERSION || chapterConfig(replay.config, run) ? replay : null;
}

/** The place a row is told it holds: its waiting better run's in place of the best it may replace. */
export function boardStanding(d: BoardDoc): Best {
  return d.next ? { ...d, score: d.next.score, run: d.next.run, at: d.next.at } : d;
}

/**
 * What a new run does to the install's row `old`: `lower` (no better than its best or the run
 * already waiting), `unverified` (better, but with no replay the server can check, so it is not
 * kept), or the row as it becomes, its new run waiting for the re-simulation.
 */
export function boardUpdate(was: BoardDoc | null, best: Best, replay: ReplayWire | null): BoardDoc | 'lower' | 'unverified' {
  // a stale row holds no place: the new run takes it over
  const old = was?.state === 'stale' ? null : was;
  if (old && best.score <= Math.max(old.score, old.next?.score ?? -1)) return 'lower';
  if (!replay) return 'unverified';
  if (old && shown(old)) return { ...old, next: { score: best.score, run: best.run, at: best.at, replay } };
  return { ...best, state: 'pending', replay };
}

/** The install's new run as the row it would be. */
export function newBest(board: string, tag: string, run: RunEntry, now: number): Best {
  return { board, tag, score: runScore(run), run, at: now };
}

/** Where `b` ranks among a board's shown rows (`rows`, any order), the install's own row aside. */
export function provisionalRank(b: Best, rows: Iterable<BoardDoc>): number {
  let n = 1;
  for (const r of rows) if (r.tag !== b.tag && shown(r) && ahead(r, b)) n++;
  return n;
}

/**
 * The re-simulation's verdict on the run made at `at` (`stale`: no engine to check it on): the
 * row as it becomes (the run shown, verified, its replay dropped; or kept aside, stale), null to
 * delete it (a refused first run), or undefined when the row no longer holds that run.
 */
export function settleBoardDoc(doc: BoardDoc, at: number, ok: boolean | 'stale'): BoardDoc | null | undefined {
  if (doc.state === 'pending' && doc.at === at) {
    if (ok === 'stale') return { ...doc, state: 'stale' };
    if (!ok) return null;
    const { state: _s, replay: _r, ...rest } = doc;
    return { ...rest, verified: true };
  }
  if (doc.next?.at !== at) return undefined;
  const { next, ...best } = doc;
  if (ok === 'stale') return { ...best, stale: next };
  if (!ok) return best;
  return { board: best.board, tag: best.tag, score: next.score, run: next.run, at: next.at, verified: true };
}

/** The waiting run of a row: its replay and when it was made (after a restart, or at its turn in the queue). */
export function boardJob(d: BoardDoc): { run: RunEntry; replay: ReplayWire; at: number } | null {
  if (d.next) return { run: d.next.run, replay: d.next.replay, at: d.next.at };
  return d.state === 'pending' && d.replay ? { run: d.run, replay: d.replay, at: d.at } : null;
}
