import { LIMITS, type Challenge, type ChallengeList, type ChallengeRunReply, type ReplayWire } from '@hk/protocol';
import { ENGINE_VERSION, takeReplay, type LocalInputSource, type SimState } from '@hk/engine';
import type { Game } from '../game/Game';
import { evolvedIn } from '../meta/codex';
import { challengeChapter, challengeState, hoursLeft, settleChallenge, type ChallengeReward, type ChallengeState } from '../meta/challenge';
import type { SaveData } from '../meta/save';
import type { Backend, RunResult } from '../net/backend';
import type { ChallengeLobby } from './challengePanel';

// The daily challenge's side of the shell (docs/design.md "Challenges"): the record fetched from
// the backend with the server's clock, the run in play, its replay taken as it ends, and the
// counted run sent with that replay. The shell asks it for the lobby's card, starts the run from
// its record and hands it the run's end to settle. Offline, or while the backend does not answer,
// there is no challenge to show.

/** A record this old is fetched again when the lobby shows (it may have closed meanwhile). */
const STALE_MS = 10 * 60 * 1000;
const DAY_MS = 86_400_000;

/** The daily as the lobby shows it. */
export interface DailyView {
  challenge: Challenge;
  state: ChallengeState;
  /** The chapter this player plays it on. */
  chapter: number;
  /** Whole hours until it closes, on the server's clock. */
  hours: number;
  /** The counted run's answer from the server this session, once in. */
  reply: ChallengeRunReply | null;
}

/** A settled challenge run: the save to keep, what it paid, and the server's answer to come (null when not sent). */
export interface ChallengeSettled {
  save: SaveData;
  reward: ChallengeReward;
  chapter: number;
  waves: number;
  /** Hours until the next challenge opens. */
  hours: number;
  reply: Promise<ChallengeRunReply | null>;
}

export class ChallengeFlow {
  private list: Challenge[] | null = null;
  /** Server time minus device time, from the last answer. */
  private offset = 0;
  private fetchedAt = -Infinity;
  private fetching = false;
  /** The challenge of the run in play, null for a chapter run. */
  run: Challenge | null = null;
  private replay: ReplayWire | null = null;
  private replies = new Map<string, ChallengeRunReply>();

  constructor(
    private readonly net: Backend,
    /** The record came in (or changed): the lobby is drawn again. */
    private readonly changed: () => void,
    /** Dev (?challenge): offline, a daily made up on the device stands in for the server's. */
    private readonly fake = false,
    private readonly now: () => number = Date.now,
  ) {}

  /** The server's clock. */
  serverNow(): number {
    return this.now() + this.offset;
  }

  /** Fetches the record when there is none, it is old, or the day it named is over. */
  refresh(): void {
    if ((!this.net.online && !this.fake) || this.fetching) return;
    const day = this.list?.find((c) => c.kind === 'daily');
    if (day && this.now() - this.fetchedAt < STALE_MS && this.serverNow() < day.end) return;
    this.fetching = true;
    void (this.net.online ? this.net.challenges() : Promise.resolve(madeUp(this.now()))).then((r) => {
      this.fetching = false;
      if (!r) return;
      this.offset = r.now - this.now();
      this.fetchedAt = this.now();
      this.list = r.challenges;
      this.changed();
    });
  }

  /** Today's daily for `save`, or null: none fetched, below the unlock level or closed. */
  daily(save: SaveData): DailyView | null {
    const c = this.list?.find((d) => d.kind === 'daily');
    if (!c || this.serverNow() >= c.end) return null;
    const state = challengeState(save, c);
    if (state === 'locked') return null;
    return { challenge: c, state, chapter: challengeChapter(save, c), hours: hoursLeft(c.end, this.serverNow()), reply: this.replies.get(c.id) ?? null };
  }

  /** The lobby's side of today's daily: its view, Play (`play` starts the run) and its board for a player with a name on the boards (`ranked`). */
  lobby(save: SaveData, ranked: boolean, play: (d: DailyView) => void): ChallengeLobby | null {
    const daily = this.daily(save);
    return daily && { daily, play: () => play(daily), board: ranked && this.net.online ? (id) => this.net.challengeBoard(id) : null };
  }

  /** Marks the run about to start as a run of `c` (null: a chapter run). */
  begin(c: Challenge | null): Challenge | null {
    this.run = c;
    this.replay = null;
    return c;
  }

  /** Takes the challenge run's replay as it ends, before the game is destroyed (a run too long for the wire has none). */
  capture(game: Game): void {
    if (!this.run || game.resumed) return;
    const replay = takeReplay(game.engine, (game.engine.input as LocalInputSource).history, 1);
    this.replay = replay.cmds.length <= LIMITS.replayNumbers ? { ...replay, config: { ...replay.config } } : null;
  }

  /**
   * Settles the challenge run that ended in `s` and sends the counted one with its replay when
   * `ranked` (no dev switch bent it, sharing is on and the player has a name on the boards).
   */
  settle(save: SaveData, s: SimState, run: RunResult, waves: number, kills: number, ranked: boolean): ChallengeSettled {
    const c = this.run!;
    this.run = null;
    const chapter = s.config.chapter;
    const settled = settleChallenge(save, c, chapter, { waves, kills, evolved: evolvedIn(s.players[0]) });
    const replay = this.replay;
    this.replay = null;
    // a give-up is a finished run too: it counts, so giving up is no way to try again
    const send = settled.reward.counted && ranked && replay;
    const reply = send ? this.net.submitChallengeRun(c.id, run, replay) : Promise.resolve(null);
    void reply.then((r) => {
      if (r) this.replies.set(c.id, r);
    });
    return { ...settled, chapter, waves, hours: hoursLeft(c.end, this.serverNow()), reply };
  }
}

/** Today's daily as the device makes it up (?challenge offline): the UTC day's id and bounds, the date as the seed. */
function madeUp(now: number): ChallengeList {
  const start = now - (now % DAY_MS);
  const ymd = Number(new Date(start).toISOString().slice(0, 10).replace(/-/g, ''));
  const daily: Challenge = { id: `d${ymd}`, kind: 'daily', start, end: start + DAY_MS, seed: ymd, chapter: 'furthest', waves: 50, mutator: null, loadout: null, engine: ENGINE_VERSION };
  return { now, challenges: [daily] };
}
