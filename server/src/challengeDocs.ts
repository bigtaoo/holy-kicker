import { WATCH_TOP, runScore, type PickWire, type ReplayWire, type RunEntry, type TopRun } from './protocol';

// How challenge runs are kept (docs/design.md "Challenges"), the same for both stores: one row
// per install per challenge board. A daily row keeps the install's first run; a weekly row its
// best, with a better run that is still being re-simulated waiting beside it in `next`, so a
// refused run never costs the install the best it had. A run this server has no engine for is
// kept aside `stale` (the row's state, or `stale` beside its best), never deleted or reported.

export interface Best {
  board: string;
  tag: string;
  score: number;
  run: RunEntry;
  at: number;
}

/** A challenge run as it arrives, checked and fitted to its challenge. */
export interface ChallengeEntry {
  board: string;
  tag: string;
  challenge: string;
  run: RunEntry;
  replay: ReplayWire;
}

/** A run waiting for its re-simulation: what the resimQueue steps, `at` naming it when it settles. */
export type ResimJob = ChallengeEntry & { at: number };

/** A weekly's better run waiting for its re-simulation beside the row's verified best. */
export interface NextRun {
  score: number;
  run: RunEntry;
  at: number;
  replay: ReplayWire;
}

/**
 * A challenge run as kept: `pending` until re-simulated (with its replay), then `entered` with
 * its pick timeline; a run outside the top RESIM_TOP enters unverified, with neither. `stale`:
 * kept with its replay, on no board, as no engine here can check it.
 */
export interface ChallengeDoc extends Best {
  challenge: string;
  state: 'pending' | 'entered' | 'stale';
  verified: boolean;
  replay?: ReplayWire;
  picks?: PickWire[];
  next?: NextRun;
  /** A better run kept beside the best with no engine to check it on, inert. */
  stale?: NextRun;
}

/** Whether `a` ranks above `b` on a board: the higher score, then whoever got there first. */
export const ahead = (a: Best, b: Best) => a.score > b.score || (a.score === b.score && a.at < b.at);

/** Weekly challenges keep the best of any number of runs; dailies the first. */
export const bestOf = (challenge: string) => challenge.startsWith('w');

/** A verified run keeps its replay only on a weekly board, where the top runs can be watched; a daily's is dropped. */
export function keptReplay(doc: ChallengeDoc): ChallengeDoc {
  if (bestOf(doc.challenge)) return doc;
  const { replay: _, ...rest } = doc;
  return rest;
}

/** A new run of `e` as a row of its own: pending, before the store knows where it ranks. */
export function freshDoc(e: ChallengeEntry, now: number): ChallengeDoc {
  return { board: e.board, tag: e.tag, challenge: e.challenge, score: runScore(e.run), run: e.run, at: now, state: 'pending', verified: false };
}

/**
 * What a new run does to the install's row `old`: nothing (`repeat`, a daily's second run;
 * `lower`, a weekly run no better than the row's best or the better one already waiting), or
 * the row as it becomes. `top`: the run would rank in the top RESIM_TOP, so it waits for its
 * re-simulation (beside a verified best as `next`, or as the row itself); otherwise it enters.
 */
export function challengeUpdate(old: ChallengeDoc | null, e: ChallengeEntry, now: number, top: boolean): ChallengeDoc | 'repeat' | 'lower' {
  const doc = freshDoc(e, now);
  if (old && !bestOf(e.challenge)) return 'repeat';
  if (old && old.state !== 'stale' && doc.score <= Math.max(old.score, old.next?.score ?? -1)) return 'lower';
  if (!top) return { ...doc, state: 'entered' };
  if (old?.state === 'entered') return { ...old, next: { score: doc.score, run: doc.run, at: now, replay: e.replay } };
  return { ...doc, replay: e.replay };
}

/**
 * The row whose place the install is told: a waiting better run in place of the best it may
 * replace (counted as entered: the install is on the board already).
 */
export function standing(doc: ChallengeDoc): ChallengeDoc {
  return doc.next ? { ...doc, score: doc.next.score, at: doc.next.at } : doc;
}

/** Whether the row has a run waiting for its re-simulation. */
export const waiting = (doc: ChallengeDoc) => doc.state === 'pending' || doc.next !== undefined;

/**
 * The re-simulation's verdict on the run made at `at` (`stale`: no engine to check it on): the
 * row as it becomes (the run entered, verified, with its pick timeline; or kept aside, stale),
 * null to delete it (a refused first run), or undefined when the row no longer holds that run
 * (a better one replaced it meanwhile).
 */
export function settleDoc(doc: ChallengeDoc, at: number, picks: PickWire[] | null | 'stale'): ChallengeDoc | null | undefined {
  if (doc.state === 'pending' && doc.at === at) {
    if (picks === 'stale') return { ...doc, state: 'stale' };
    return picks ? { ...keptReplay(doc), state: 'entered', verified: true, picks } : null;
  }
  if (doc.next?.at !== at) return undefined;
  const { next, ...best } = doc;
  if (picks === 'stale') return { ...best, stale: next };
  if (!picks) return best;
  return keptReplay({ ...best, score: next.score, run: next.run, at: next.at, replay: next.replay, state: 'entered', verified: true, picks });
}

/** The re-simulation job of a row's waiting run (after a restart). */
export function jobOf(d: ChallengeDoc): ResimJob | null {
  const base = { board: d.board, tag: d.tag, challenge: d.challenge };
  if (d.next) return { ...base, run: d.next.run, replay: d.next.replay, at: d.next.at };
  return d.state === 'pending' && d.replay ? { ...base, run: d.run, replay: d.replay, at: d.at } : null;
}

/** A weekly board's top runs that publish their pick timeline, from its rows in rank order. */
export function topRuns(board: string, ranked: readonly ChallengeDoc[]): TopRun[] | undefined {
  if (!bestOf(board)) return undefined;
  return ranked.slice(0, WATCH_TOP).filter((d) => d.verified && d.picks).map((d) => ({ tag: d.tag, picks: d.picks!, replay: d.replay !== undefined }));
}
