import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine, TICK_RATE, type SimState } from '@hk/engine';
import { DAILY_WAVES, challengeBoardId, type Challenge, type Host } from '@hk/protocol';
import { checkBatch, checkChallengeRun, checkRunPost } from '../../../server/src/rules';
import { challengeFor, dailyOf, misfit, weeklyOf } from '../../../server/src/challenge';
import type { Game } from '../game/Game';
import { DEFAULT_SCENE } from '../game/scene';
import { runConfig, type RunSetup } from '../game/runSetup';
import { challengeChapter, challengeSetup } from '../meta/challenge';
import { newSave, type SaveData } from '../meta/save';
import { Backend, type RunMiss, type RunRank } from '../net/backend';
import { runBuild } from '../net/leaveProps';
import type { Platform } from '../platform/types';
import { THEME } from '../theme';
import { ChallengeFlow, type ChallengeSettled } from './challengeFlow';
import { runEnd, type RunEndInput } from './runEnd';

// The end-of-run decision (runEnd.ts) over the runs that end: what is tracked, what goes to the
// chapter board with which name, and what a challenge run hands its settle; then the same runs go
// through the real Backend and ChallengeFlow, and what they post must pass the server's rules.

const NOW = Date.UTC(2026, 9, 24, 12);
const DICE = { dice: 1234 };
const player: SaveData = { ...newSave(), level: 12, firstRunDone: true, cleared: 3, chapter: 4, dice: DICE.dice };

/** A chapter run's setup, as RunFlow.start makes it with no dev switch. */
function chapterSetup(chapter: number, hard = false, waves = 50): RunSetup {
  return { chapter, waves, revives: 1, relic: 'ball', sutras: [], bonus: {}, hard, monk: 'kicker', firstRun: false };
}

const DAILY: Challenge = dailyOf(NOW);
const WEEKLY: Challenge = weeklyOf(NOW);

/** A real run of `setup` stepped a moment, then ended `outcome` on `wave` after `seconds`. */
function ended(setup: RunSetup, outcome: SimState['outcome'], wave: number, seconds: number): Engine {
  const engine = new Engine(runConfig(DEFAULT_SCENE, setup.seed || 4242, setup));
  for (let i = 0; i < 10; i++) engine.step([]);
  const s = engine.state;
  [s.outcome, s.wave, s.tick] = [outcome, wave, seconds * TICK_RATE];
  return engine;
}

/** One way a run ends, with its setup and the shell's state around it. */
interface Case {
  what: string;
  setup: RunSetup;
  outcome: SimState['outcome'];
  wave: number;
  seconds: number;
  challenge?: Challenge;
  input?: Partial<RunEndInput>;
}

const daily = (save = player): RunSetup => challengeSetup(save, DAILY);

const CASES: Case[] = [
  { what: 'chapter won', setup: chapterSetup(3), outcome: 'won', wave: 50, seconds: 900 },
  { what: 'chapter lost', setup: chapterSetup(3), outcome: 'lost', wave: 17, seconds: 300, input: { cause: 'boss' } },
  { what: 'chapter given up', setup: chapterSetup(3), outcome: 'playing', wave: 8, seconds: 140 },
  { what: 'chapter given up in its first seconds', setup: chapterSetup(1), outcome: 'playing', wave: 1, seconds: 2 },
  { what: 'hard won', setup: chapterSetup(2, true), outcome: 'won', wave: 50, seconds: 1000 },
  { what: "an experiment's short first run won", setup: chapterSetup(1, false, 20), outcome: 'won', wave: 20, seconds: 400 },
  { what: 'a dev switch', setup: chapterSetup(3), outcome: 'won', wave: 50, seconds: 900, input: { ranked: false } },
  { what: 'a portal guest', setup: chapterSetup(3), outcome: 'lost', wave: 9, seconds: 160, input: { name: null, named: false } },
  { what: 'a portal guest offline', setup: chapterSetup(3), outcome: 'lost', wave: 9, seconds: 160, input: { name: null, named: false, online: false } },
  { what: 'a portal account', setup: chapterSetup(3), outcome: 'lost', wave: 9, seconds: 160, input: { name: { name: 'Kicker99' } } },
  { what: 'daily won on its last wave', setup: daily(), outcome: 'won', wave: DAILY_WAVES, seconds: 330, challenge: DAILY },
  { what: 'daily lost', setup: daily(), outcome: 'lost', wave: 6, seconds: 100, challenge: DAILY },
  { what: 'daily given up', setup: daily(), outcome: 'playing', wave: 3, seconds: 50, challenge: DAILY },
  { what: 'daily under a dev switch', setup: daily(), outcome: 'lost', wave: 6, seconds: 100, challenge: DAILY, input: { ranked: false } },
  { what: 'weekly lost', setup: challengeSetup(player, WEEKLY), outcome: 'lost', wave: 23, seconds: 420, challenge: WEEKLY },
  { what: 'weekly won', setup: challengeSetup(player, WEEKLY), outcome: 'won', wave: 50, seconds: 950, challenge: WEEKLY },
];

/** RunEndInput for `c`, as RunFlow.settle gathers it. */
function inputOf(c: Case, engine = ended(c.setup, c.outcome, c.wave, c.seconds)): RunEndInput {
  const s = engine.state;
  return {
    s, chapter: s.config.chapter, hard: s.config.hard, kills: 321, ranked: true, challenge: c.challenge ?? null,
    name: DICE, named: true, online: true, cause: null, build: runBuild(s, 321), ...c.input,
  };
}

const of = (what: string) => runEnd(inputOf(CASES.find((c) => c.what === what)!));

describe('runEnd', () => {
  it('enters a full chapter run on its board with the name, won, lost or given up', () => {
    const won = of('chapter won');
    expect(won.counted).toBe(true);
    expect(won.board).toEqual({ chapter: 3, hard: false, won: true, wave: 50, tenths: 9000, level: 1, kills: 321, monk: 'kicker', relic: 'ball', ...DICE });
    expect(won.waves).toBe(50);
    expect(won.challenge).toBeNull();
    expect(won.track).toMatchObject({ chapter: 3, won: true, waves: 50, gaveUp: false });
    expect(won.track.challenge).toBeUndefined();

    const lost = of('chapter lost');
    expect(lost.board).toMatchObject({ won: false, wave: 17, ...DICE });
    expect(lost.waves).toBe(16);
    expect(lost.track).toMatchObject({ cause: 'boss', gaveUp: false });

    const gaveUp = of('chapter given up');
    expect(gaveUp.board).toMatchObject({ won: false, wave: 8 });
    expect(gaveUp.track).toMatchObject({ gaveUp: true });
    expect(gaveUp.track.cause).toBeUndefined();
  });

  it('keeps a give-up in its first seconds off the board, which would refuse its time', () => {
    const quick = of('chapter given up in its first seconds');
    expect(quick.counted).toBe(true);
    expect(quick.board).toBeNull();
    expect(quick.note).toBeNull();
  });

  it('enters a hard run on the hard board', () => {
    expect(of('hard won').board).toMatchObject({ chapter: 2, hard: true, won: true, wave: 50 });
  });

  it("never ranks or times an experiment's short first run (the server would refuse its win)", () => {
    const short = of("an experiment's short first run won");
    expect(short.counted).toBe(false);
    expect(short.board).toBeNull();
    expect(short.track).toMatchObject({ waves: 20, won: true });
    const sent = checkRunPost({ ...short.run, ...DICE, install: 'abcdefgh12', host: 'web', build: '1.0.0', replay: null });
    expect(sent).toEqual({ ok: false, reason: 'bad wave' });
  });

  it('sends nothing a dev switch bent', () => {
    expect(of('a dev switch')).toMatchObject({ counted: false, board: null, note: null });
    expect(of('daily under a dev switch').challenge).toEqual({ run: expect.not.objectContaining({ dice: expect.anything() }), ranked: false });
  });

  it('tells a portal guest why the run is on no board, online only', () => {
    expect(of('a portal guest')).toMatchObject({ counted: true, board: null, note: 'guest' });
    expect(of('a portal guest offline')).toMatchObject({ board: null, note: null });
    expect(of('a portal account').board).toMatchObject({ name: 'Kicker99' });
  });

  it("hands a daily's run to its settle with the name, won on its last wave, lost or given up", () => {
    const won = of('daily won on its last wave');
    expect(won).toMatchObject({ counted: false, board: null, note: null, waves: DAILY_WAVES });
    expect(won.challenge).toEqual({ run: expect.objectContaining({ won: true, wave: DAILY_WAVES, chapter: challengeChapter(player, DAILY), ...DICE }), ranked: true });
    expect(won.track).toMatchObject({ challenge: DAILY.id, waves: DAILY_WAVES });
    expect(of('daily lost').challenge).toMatchObject({ run: { won: false, wave: 6 }, ranked: true });
    expect(of('daily given up').challenge).toMatchObject({ run: { won: false, wave: 3 }, ranked: true });
  });

  it("hands a weekly's run to its settle on the week's chapter", () => {
    const lost = of('weekly lost');
    expect(lost.board).toBeNull();
    expect(lost.challenge).toMatchObject({ run: { chapter: WEEKLY.loadout!.chapter, wave: 23, ...DICE }, ranked: true });
    expect(of('weekly won').challenge).toMatchObject({ run: { won: true, wave: 50 }, ranked: true });
  });

  it('a challenge run with no name goes unranked', () => {
    const c = CASES.find((x) => x.what === 'weekly lost')!;
    expect(runEnd({ ...inputOf(c), name: null, named: false }).challenge).toMatchObject({ ranked: false });
  });
});

// The contract: each case played out as RunFlow.settle does it, through the real Backend and
// ChallengeFlow against a fake fetch, and every post checked by the server's own rules.

interface Post {
  path: string;
  body: unknown;
}

const API = 'https://api.test';

/** A server that takes every post; `down` fails every call as with no network. */
function server() {
  const posts: Post[] = [];
  const net = { down: false };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (net.down) throw new TypeError('Failed to fetch');
    const path = url.slice(API.length);
    if (init.method === 'POST') posts.push({ path, body: JSON.parse(init.body as string) });
    const reply = path === '/v1/runs' ? { board: 'c3', rank: 4, best: true } : path === '/v1/challenge/runs' ? { board: 'b', rank: 2, total: 9, status: 'pending', tag: 1 } : {};
    return { ok: true, status: 200, json: async () => reply };
  });
  return { posts, net, of: (path: string) => posts.filter((p) => p.path === path).map((p) => p.body) };
}

function backend(host: Host = 'crazygames'): Backend {
  const kept = new Map<string, string>();
  const platform = {
    host,
    storage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) },
    onHide: () => {},
  } as unknown as Platform;
  return new Backend(platform, API, '1.0.0', () => 'en');
}

interface Played {
  end: ReturnType<typeof runEnd>;
  rank: RunRank | RunMiss | null;
  settled: ChallengeSettled | null;
}

/** `c` ended and settled as RunFlow.settle does: tracked, entered on its board, a challenge run settled and sent. */
async function play(c: Case, net: Backend, save = player): Promise<Played> {
  const engine = ended(c.setup, c.outcome, c.wave, c.seconds);
  const flow = new ChallengeFlow(net, () => {}, false, false, () => NOW);
  flow.begin(c.challenge ?? null);
  const replay = flow.capture({ resumed: false, engine } as unknown as Game);
  const end = runEnd(inputOf(c, engine));
  net.track('run_end', end.track);
  const rank = end.board ? net.submitRun(end.board, replay) : Promise.resolve(null);
  const settled = end.challenge ? flow.settle(save, engine.state, end.challenge.run, end.waves, 321, end.challenge.ranked) : null;
  await net.flush();
  await settled?.reply;
  return { end, rank: await rank, settled };
}

/** Every post the server would get, through its own checks: none may be refused. */
function accepted(posts: Post[]): void {
  for (const { path, body } of posts) {
    if (path === '/v1/events') expect(checkBatch(body, Date.now())).toMatchObject({ ok: true });
    else if (path === '/v1/runs') {
      const r = checkRunPost(body);
      expect(r).toMatchObject({ ok: true });
      if (r.ok) expect(r.value.replay).not.toBeNull();
    } else if (path === '/v1/challenge/runs') {
      const r = checkChallengeRun(body);
      expect(r).toMatchObject({ ok: true });
      if (!r.ok) continue;
      const open = challengeFor(r.value.challenge, Date.now());
      expect(open).not.toBeNull();
      expect(misfit(open!, r.value.run, r.value.replay)).toBeNull();
    } else throw new Error(`unexpected post ${path}`);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('runEnd against the server', () => {
  it.each(CASES.map((c) => [c.what, c] as const))('%s: what goes out is taken', async (_, c) => {
    const s = server();
    const { end, rank, settled } = await play(c, backend());
    accepted(s.posts);
    expect(s.of('/v1/events')).toHaveLength(1);
    const runs = s.of('/v1/runs');
    const challengeRuns = s.of('/v1/challenge/runs');
    expect(runs).toHaveLength(end.board ? 1 : 0);
    expect(challengeRuns).toHaveLength(end.challenge?.ranked ? 1 : 0);
    if (end.board) {
      expect(runs[0]).toMatchObject({ ...end.board, host: 'crazygames', game: THEME });
      expect(rank).toMatchObject({ rank: 4 });
    }
    if (end.challenge?.ranked) {
      expect(challengeRuns[0]).toMatchObject({ challenge: c.challenge!.id, run: end.challenge.run });
      expect(await settled!.reply).toMatchObject({ rank: 2 });
    }
  });

  it("refuses what the client keeps back: a give-up's first seconds, a short experiment's win", () => {
    const post = (what: string) => {
      const { run } = of(what);
      return checkRunPost({ ...run, ...DICE, install: 'abcdefgh12', host: 'web', build: '1.0.0', replay: null });
    };
    expect(post('chapter given up in its first seconds')).toEqual({ ok: false, reason: 'bad time' });
    expect(post("an experiment's short first run won")).toEqual({ ok: false, reason: 'bad wave' });
  });

  it("sends only the day's counted daily", async () => {
    const s = server();
    await play(CASES.find((x) => x.what === 'daily lost')!, backend(), { ...player, challenge: DAILY.id });
    expect(s.of('/v1/challenge/runs')).toHaveLength(0);
  });

  it("sends a weekly run below the save's best when that best is on an older engine's board", async () => {
    const s = server();
    const old = challengeBoardId(WEEKLY.id, WEEKLY.engine - 1, WEEKLY.loadout!.chapter, THEME);
    const save = { ...player, weeks: [{ id: WEEKLY.id, board: old, end: WEEKLY.end, best: 40 }] };
    const { settled } = await play(CASES.find((x) => x.what === 'weekly lost')!, backend(), save);
    expect(settled!.weekly).toEqual({ before: 0 });
    expect(s.of('/v1/challenge/runs')).toHaveLength(1);
    accepted(s.posts);
  });

  it('keeps the runs home with the boards off, whatever the stats consent', async () => {
    const s = server();
    const net = backend();
    net.setBoards(false);
    const chapter = await play(CASES[0], net);
    const daily = await play(CASES.find((x) => x.what === 'daily lost')!, net);
    expect(chapter.rank).toBe('off');
    expect(await daily.settled!.reply).toBeNull();
    expect(s.posts.map((p) => p.path)).toEqual(['/v1/events', '/v1/events']);
    accepted(s.posts);
  });

  it('enters the runs with the stats consent off, and tracks nothing', async () => {
    const s = server();
    const net = backend();
    net.setSharing('off');
    await play(CASES[0], net);
    await play(CASES.find((x) => x.what === 'weekly lost')!, net);
    expect(s.posts.map((p) => p.path)).toEqual(['/v1/runs', '/v1/challenge/runs']);
    accepted(s.posts);
  });

  it('keeps an unanswered board run and sends it again once the server answers', async () => {
    const s = server();
    const net = backend();
    s.net.down = true;
    const { rank, end } = await play(CASES[1], net);
    expect(rank).toBe('queued');
    s.net.down = false;
    await net.resendBoards();
    expect(s.of('/v1/runs')).toEqual([expect.objectContaining(end.board)]);
    accepted(s.posts);
  });
});
