import { LIMITS, challengeBoardId, weekIdOf, weekStart, WEEK_MS, type Challenge, type ChallengeList, type ChallengeRunReply, type ReplayWire, type TopRun } from '@hk/protocol';
import { ENGINE_VERSION, MUTATOR_IDS, takeReplay, type LocalInputSource, type Replay, type SimState } from '@hk/engine';
import type { Game } from '../game/Game';
import { evolvedIn } from '../meta/codex';
import { challengeChapter, challengeState, hoursLeft, settleChallenge, type ChallengeReward, type ChallengeState } from '../meta/challenge';
import type { SaveData } from '../meta/save';
import { claimWeek, closedWeeks, settleWeekly, weekClaim, weekOf, weeklyState, type WeekClaim, type WeekEntry, type WeeklyState } from '../meta/weekly';
import type { Backend, RunResult } from '../net/backend';
import { THEME } from '../theme';
import type { ChallengeLobby } from './challengePanel';
import type { ReplayView } from './replayWatch';

// The challenges' side of the shell (docs/design.md "Challenges"): the records fetched from the
// backend with the server's clock, the run in play, its replay taken as it ends, and the run sent
// with that replay. The shell asks it for the lobby's card, starts the run from its record and
// hands it the run's end to settle. A weekly also has its closed weeks paid (their final rank
// asked once a session) and its top runs' replays fetched to watch. Offline, or while the backend
// does not answer, there is no challenge to show.

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

/** The weekly as the lobby shows it. */
export interface WeeklyView {
  challenge: Challenge;
  state: Exclude<WeeklyState, 'locked'>;
  /** Its board, on this engine version. */
  board: string;
  /** The player's best waves this week, 0 before a finished run. */
  best: number;
  /** Time until it closes, on the server's clock, in whole days and the hours past them. */
  days: number;
  hours: number;
  /** The last run's answer from the server this session, once in. */
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
  /** A weekly run: the week's best waves before it (0 for the first). */
  weekly?: { before: number };
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
  /** Closed weeks by id: their claim once the rank is in, or asking (also failed: asked again next launch). */
  private claims = new Map<string, WeekClaim | 'asking'>();

  constructor(
    private readonly net: Backend,
    /** The record came in (or changed): the lobby is drawn again. */
    private readonly changed: () => void,
    /** Dev (?challenge): offline, challenges made up on the device stand in for the server's. */
    private readonly fake = false,
    /** Dev (?challenge=settle): the saved weeks count as closed. */
    private readonly settleWeeks = false,
    private readonly now: () => number = Date.now,
  ) {}

  /** The server's clock. */
  serverNow(): number {
    return this.now() + this.offset;
  }

  /** Fetches the records when there are none, they are old, or one of them is over. */
  refresh(): void {
    if ((!this.net.online && !this.fake) || this.fetching) return;
    if (this.list && this.now() - this.fetchedAt < STALE_MS && this.list.every((c) => this.serverNow() < c.end)) return;
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

  private open(kind: Challenge['kind']): Challenge | null {
    const c = this.list?.find((d) => d.kind === kind);
    return c && this.serverNow() < c.end ? c : null;
  }

  /** Today's daily for `save`, or null: none fetched, below the unlock level or closed. */
  daily(save: SaveData): DailyView | null {
    const c = this.open('daily');
    const state = c && challengeState(save, c);
    if (!c || !state || state === 'locked') return null;
    return { challenge: c, state, chapter: challengeChapter(save, c), hours: hoursLeft(c.end, this.serverNow()), reply: this.replies.get(c.id) ?? null };
  }

  /** This week's weekly for `save`, or null: none fetched, chapter 1 not cleared yet, or closed. */
  weekly(save: SaveData): WeeklyView | null {
    const c = this.open('weekly');
    const state = c?.loadout && weeklyState(save, c);
    if (!c || !state || state === 'locked') return null;
    const h = hoursLeft(c.end, this.serverNow());
    return {
      challenge: c, state, board: challengeBoardId(c.id, c.engine, c.loadout!.chapter, THEME), best: weekOf(save, c.id)?.best ?? 0,
      days: Math.floor(h / 24), hours: h % 24, reply: this.replies.get(c.id) ?? null,
    };
  }

  /**
   * The lobby's side of the challenges: the daily and the weekly, Play (`play` starts a run of a
   * challenge on a chapter), the boards for a player with a name on them (`ranked`), a top run's
   * replay to watch (`watch` shows it), and a closed week's reward to claim (`claimed` keeps it).
   */
  lobby(save: SaveData, ranked: boolean, play: (c: Challenge, chapter: number) => void, watch: (v: ReplayView) => void, claimed: (save: SaveData) => void): ChallengeLobby | null {
    const daily = this.daily(save);
    const weekly = this.weekly(save);
    const claim = this.claim(save);
    if (!daily && !weekly && !claim) return null;
    const online = ranked && this.net.online;
    return {
      daily, weekly, claim,
      play,
      board: online ? (id) => this.net.challengeBoard(id) : null,
      watch: online ? (board, top, name, from) => this.watch(board, top, name, from, watch) : null,
      take: (c) => {
        this.claims.delete(c.week.id);
        claimed(claimWeek(save, c));
      },
    };
  }

  /** Fetches a top run's replay and has it watched from pick tick `from`; false when it could not be fetched or is not of this engine. */
  private async watch(board: string, top: TopRun, name: string, from: number | undefined, watch: (v: ReplayView) => void): Promise<boolean> {
    const wire = await this.net.challengeReplay(board, top.tag);
    if (!wire || wire.engine !== ENGINE_VERSION) return false;
    watch({ replay: wire as unknown as Replay, picks: top.picks, name, from });
    return true;
  }

  /**
   * The first closed week ready to pay, or null: each closed week's final rank is asked once a
   * session (its board's own row; no row, as for a run never sent, pays taking part alone).
   */
  private claim(save: SaveData): WeekClaim | null {
    if (!this.net.online && !this.fake) return null;
    if (this.fetchedAt === -Infinity && !this.settleWeeks) return null; // the server's clock is not known yet
    for (const week of closedWeeks(save, this.settleWeeks ? Infinity : this.serverNow())) {
      const got = this.claims.get(week.id);
      if (got && got !== 'asking') return got;
      if (!got) this.ask(week);
    }
    return null;
  }

  private ask(week: WeekEntry): void {
    this.claims.set(week.id, 'asking');
    if (!this.net.online) {
      // ?challenge offline: a made-up rank, to see the claim
      this.claims.set(week.id, weekClaim(week, 2, 10));
      return this.changed();
    }
    void this.net.challengeBoard(week.board).then((r) => {
      if (!r || r.pending) return; // asked again at the next launch
      this.claims.set(week.id, weekClaim(week, r.mine?.rank ?? 0, r.total));
      this.changed();
    });
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
   * Settles the challenge run that ended in `s` and sends it with its replay when `ranked` (no
   * dev switch bent it, sharing is on and the player has a name on the boards): a daily's counted
   * run, a weekly's run unless short of the week's best (the server keeps the best).
   */
  settle(save: SaveData, s: SimState, run: RunResult, waves: number, kills: number, ranked: boolean): ChallengeSettled {
    const c = this.run!;
    this.run = null;
    const chapter = s.config.chapter;
    const result = { waves, kills, evolved: evolvedIn(s.players[0]) };
    const replay = this.replay;
    this.replay = null;
    const send = (ok: boolean) => {
      const reply = ok && ranked && replay ? this.net.submitChallengeRun(c.id, run, replay) : Promise.resolve(null);
      void reply.then((r) => {
        if (r) this.replies.set(c.id, r);
      });
      return reply;
    };
    if (c.loadout) {
      const week = settleWeekly(save, c, challengeBoardId(c.id, c.engine, chapter, THEME), result);
      const reward = { counted: true, reached: [], copper: 0, jade: 0 };
      return { save: week.save, reward, chapter, waves, hours: hoursLeft(c.end, this.serverNow()), reply: send(waves >= week.before), weekly: { before: week.before } };
    }
    const settled = settleChallenge(save, c, chapter, result);
    // a give-up is a finished run too: it counts, so giving up is no way to try again
    return { ...settled, chapter, waves, hours: hoursLeft(c.end, this.serverNow()), reply: send(settled.reward.counted) };
  }
}

/** The challenges as the device makes them up (?challenge offline): the UTC day's and ISO week's ids and bounds, a seed from each, the daily's mutator by the day as the server picks it. */
function madeUp(now: number): ChallengeList {
  const start = now - (now % DAY_MS);
  const ymd = Number(new Date(start).toISOString().slice(0, 10).replace(/-/g, ''));
  const daily: Challenge = { id: `d${ymd}`, kind: 'daily', start, end: start + DAY_MS, seed: ymd, chapter: 'furthest', waves: 20, mutator: MUTATOR_IDS[(start / DAY_MS) % MUTATOR_IDS.length], loadout: null, engine: ENGINE_VERSION };
  const week = weekStart(now);
  const id = weekIdOf(now);
  const loadout = { relic: 'bowl', monk: 'novice', sutras: ['lotus', 'roar'], chapter: 2 };
  const weekly: Challenge = { id, kind: 'weekly', start: week, end: week + WEEK_MS, seed: Number(id.slice(1).replace('-', '')), chapter: 2, waves: 50, mutator: 'swift', loadout, engine: ENGINE_VERSION };
  return { now, challenges: [daily, weekly] };
}
