import type { SimState } from '@hk/engine';
import { LIMITS, type BoardName, type Challenge, type PropValue } from '@hk/protocol';
import { BALANCE } from '../meta/balance';
import type { RunResult } from '../net/backend';
import { clearedWaves, runSummary } from './runSummary';

// What an ended run counts for (runFlow.ts settle), pure: what `run_end` tracks, whether the run
// goes to its chapter board and with which name, why a run that counted is on none, and what a
// challenge run hands its settle (meta/challenge.ts, meta/weekly.ts via ChallengeFlow). Whether a
// run that is sent arrives (the boards' switch, the outbox) is the Backend's business.

/** How the run ended and what the shell knows around it. */
export interface RunEndInput {
  s: SimState;
  chapter: number;
  hard: boolean;
  kills: number;
  /** No dev switch bent the rules (game/scene.ts rankedRun). */
  ranked: boolean;
  /** The challenge of the run, null for a chapter run. */
  challenge: Challenge | null;
  /** The name the player's runs go out with (PlayerName.board); null keeps them off the boards. */
  name: BoardName | null;
  /** The player is on the boards at all (PlayerName.ranked): not a portal guest. */
  named: boolean;
  /** A backend is there to send to. */
  online: boolean;
  /** What felled the hero, for a lost run. */
  cause?: string | null;
  /** The run's build fields (net/leaveProps.ts runBuild). */
  build: Record<string, PropValue>;
}

export interface RunEnd {
  /** The run as the backend counts it, with no name. */
  run: RunResult;
  /** The `run_end` event's fields. */
  track: Record<string, PropValue>;
  /** The waves it fully cleared. */
  waves: number;
  /** A full chapter run under the normal rules: on its board and timed. */
  counted: boolean;
  /** The chapter board's entry (with its name), or null when none is sent. */
  board: RunResult | null;
  /** Why a counted run has no rank: a portal guest. */
  note: 'guest' | null;
  /** A challenge run's settle: the run with its name, and whether it may go to the board. */
  challenge: { run: RunResult; ranked: boolean } | null;
}

/** Whether the server takes the run's time for its wave (rules.ts checkRun): a give-up in its first seconds is not. */
export function plausible(run: Pick<RunResult, 'wave' | 'tenths'>): boolean {
  return run.tenths >= run.wave * LIMITS.minSecondsPerWave * 10;
}

export function runEnd(i: RunEndInput): RunEnd {
  const { s, challenge: c } = i;
  const run = runSummary(s, i.chapter, i.hard, i.kills);
  const track = {
    ...run, waves: s.config.waves, ...i.build, gaveUp: s.outcome === 'playing',
    ...(s.outcome === 'lost' && i.cause ? { cause: i.cause } : {}), ...(c && { challenge: c.id }),
  };
  // a run shorter than the chapter (an experiment's first run) is never on a board, nor timed;
  // a challenge's is on its own (a daily's 20 waves)
  const counted = i.ranked && !c && s.config.waves === BALANCE.waves;
  const name = (counted || (i.ranked && c)) && plausible(run) ? i.name : null;
  // a portal guest is told why the run is on no board
  const note = counted && i.online && !i.named ? 'guest' : null;
  return {
    run, track, waves: clearedWaves(s), counted, note,
    board: counted && name ? { ...run, ...name } : null,
    challenge: c ? { run: { ...run, ...name }, ranked: !!name } : null,
  };
}
