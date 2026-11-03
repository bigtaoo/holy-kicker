import type { RunEntry } from '@hk/protocol';
import type { HostBoards } from '../types';
import type { PlaygamaBridge } from './bridge';

// Playgama's leaderboards through Bridge, where Bridge says the game draws them itself (`in_game`),
// set up in the Playgama console. One for now: the weekly challenge's, `weekly`, beside our backend's
// board (which the lobby still shows; the sandbox, cut off from our backend, has no weekly at all).
// A Playgama board never empties, so the week goes into the score above the run: a later week's runs
// rank above every earlier one's.

/** The weekly board's tag in the Playgama console. */
export const WEEKLY = 'weekly';

/**
 * Weekly run `run` of week `id` ('w2026-45') as one score: the week (counted from 2026), then a
 * clear above any wave, then the waves, then fewer seconds. Under 2^31 until about 2066.
 */
export function weeklyScore(id: string, run: Pick<RunEntry, 'won' | 'wave' | 'tenths'>): number | null {
  const m = /^w(\d{4})-(\d{2})$/.exec(id);
  if (!m) return null;
  const week = (Number(m[1]) - 2026) * 53 + Number(m[2]);
  const wave = run.won ? 99 : Math.max(0, Math.min(98, Math.floor(run.wave)));
  const fast = 9999 - Math.max(0, Math.min(9999, Math.floor(run.tenths / 10)));
  return week * 1e6 + wave * 1e4 + fast;
}

export class BridgeBoards implements HostBoards {
  /** The best score sent this session: a worse run is not sent again. */
  private sent = 0;

  constructor(private readonly bridge: Pick<PlaygamaBridge, 'setScore'>) {}

  weekly(id: string, run: Pick<RunEntry, 'won' | 'wave' | 'tenths'>): void {
    const score = weeklyScore(id, run);
    if (score === null || score <= this.sent) return;
    this.sent = score;
    this.bridge.setScore(WEEKLY, score);
  }
}

/** Bridge's boards where the game draws them, else none. */
export const bridgeBoards = (bridge: PlaygamaBridge): BridgeBoards | undefined => (bridge.boardsInGame() ? new BridgeBoards(bridge) : undefined);
