import { ENGINE_VERSION, MONK_IDS, RELIC_IDS, SUTRA_IDS } from '@hk/engine';
import { describe, expect, it } from 'vitest';
import { DAY_MS, LATE_MS, WEEK_MS, challengeFor, misfit, rotationLoadout, weekIdOf, weekStart, weeklyOf } from './challenge';
import { challengeUpdate, settleDoc, type ChallengeDoc, type ChallengeEntry } from './challengeDocs';
import { WeekMarks, weekMarks } from './marks';
import { WATCH_TOP, challengeBoardId, weekTier, type BoardReply, type ChallengeBoardReply, type ReplayWire } from './protocol';
import { rankedConfig } from './resim';
import { ResimQueue } from './resimQueue';
import { route, type Deps, type Req } from './routes';
import { MemoryStore } from './store';
import { INSTALL, playRun } from './testPlay';
import { WEEKLIES } from './weeklies';

const NOW = Date.parse('2026-10-18T09:30:00Z');
const WEEKLY = weeklyOf(NOW);
const BOARD = challengeBoardId(WEEKLY.id, ENGINE_VERSION, WEEKLY.chapter as number);
const SHORT = playRun(WEEKLY, 1500);
const LONG = playRun(WEEKLY, 3000);

describe('the weekly', () => {
  it('runs Monday 00:00 UTC to Monday, named by its ISO week', () => {
    expect(WEEKLY).toMatchObject({ id: 'w2026-42', kind: 'weekly', start: Date.parse('2026-10-12T00:00:00Z'), end: Date.parse('2026-10-19T00:00:00Z'), waves: 50, mutator: null, engine: ENGINE_VERSION });
    expect(weeklyOf(WEEKLY.end - 1).id).toBe(WEEKLY.id);
    expect(weeklyOf(WEEKLY.end).id).toBe('w2026-43');
    expect(weekIdOf(Date.parse('2027-01-01T12:00:00Z'))).toBe('w2026-53');
    expect(weekIdOf(Date.parse('2026-01-01T00:00:00Z'))).toBe('w2026-01');
    expect(weekIdOf(Date.parse('2027-01-04T00:00:00Z'))).toBe('w2027-01');
    expect(weekStart(Date.parse('2026-10-14T23:00:00Z'))).toBe(WEEKLY.start);
  });

  it('fixes the whole loadout, from the hand-picked record or the rotation', () => {
    expect(WEEKLY.loadout).toEqual(rotationLoadout(WEEKLY.start));
    expect(WEEKLY.chapter).toBe(WEEKLY.loadout!.chapter);
    const picked = weeklyOf(Date.parse('2026-10-21T00:00:00Z'));
    expect(picked.loadout).toEqual({ relic: 'bowl', monk: 'fat', sutras: ['lotus', 'roar'], chapter: 2 });
    // ten weeks of rotation see every relic and monk, and every chapter
    const weeks = Array.from({ length: 10 }, (_, k) => rotationLoadout(WEEKLY.start + k * WEEK_MS));
    expect(new Set(weeks.map((l) => l.relic)).size).toBe(RELIC_IDS.length);
    expect(new Set(weeks.map((l) => l.monk)).size).toBe(MONK_IDS.length);
    expect(new Set(weeks.map((l) => l.chapter)).size).toBe(5);
    expect(new Set(Array.from({ length: 30 }, (_, k) => weeklyOf(NOW + k * WEEK_MS).seed)).size).toBe(30);
  });

  it('has hand-picked records a ranked run could play', () => {
    for (const [id, w] of Object.entries(WEEKLIES)) {
      expect(id).toMatch(/^w\d{4}-\d{2}$/);
      expect(RELIC_IDS).toContain(w.relic);
      expect(MONK_IDS).toContain(w.monk);
      for (const s of w.sutras) expect(SUTRA_IDS).toContain(s);
      expect(w.chapter >= 1 && w.chapter <= 5).toBe(true);
      const c = weeklyOf(Date.parse(`${id.slice(1, 5)}-01-04T00:00:00Z`) + (Number(id.slice(6)) - 1) * WEEK_MS);
      expect(c.id).toBe(id);
      expect(rankedConfig(playRun(c, 30).replay.config)).not.toBeNull();
    }
  });

  it('takes runs until a little after the week closed', () => {
    expect(challengeFor(WEEKLY.id, NOW)?.loadout).toEqual(WEEKLY.loadout);
    expect(challengeFor(WEEKLY.id, WEEKLY.end + LATE_MS - 1)?.id).toBe(WEEKLY.id);
    expect(challengeFor(WEEKLY.id, WEEKLY.end + LATE_MS)).toBeNull();
    expect(challengeFor('w2026-43', NOW)).toBeNull();
  });

  it('refuses a run without its loadout', () => {
    const { run, replay } = SHORT;
    const cfg = replay.config;
    expect(misfit(WEEKLY, run, replay)).toBeNull();
    expect(misfit(WEEKLY, run, { ...replay, config: { ...cfg, sutras: SUTRA_IDS } })).toBe('loadout');
    expect(misfit(WEEKLY, run, { ...replay, config: { ...cfg, sutras: (cfg.sutras as string[]).slice(1) } })).toBe('loadout');
    expect(misfit(WEEKLY, run, { ...replay, config: { ...cfg, bonus: { attack: 5 } } })).toBe('loadout');
    expect(misfit(WEEKLY, run, { ...replay, config: { ...cfg, bonus: { attack: 0 } } })).toBeNull();
    const other = WEEKLY.chapter === 1 ? 2 : 1;
    expect(misfit(WEEKLY, { ...run, chapter: other }, { ...replay, config: { ...cfg, chapter: other } })).toBe('chapter');
  });

  it('tiers ranks: top 3, top 10 %, top 50 %', () => {
    expect(weekTier(1, 1)).toBe(3);
    expect(weekTier(3, 1000)).toBe(3);
    expect(weekTier(4, 1000)).toBe(2);
    expect(weekTier(100, 1000)).toBe(2);
    expect(weekTier(101, 1000)).toBe(1);
    expect(weekTier(500, 1000)).toBe(1);
    expect(weekTier(501, 1000)).toBe(0);
    expect(weekTier(0, 10)).toBe(0);
    expect(weekMarks([['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], ['h']])).toEqual(new Map([['a', 3], ['b', 3], ['c', 3], ['d', 1], ['h', 3]]));
  });
});

describe('a weekly row', () => {
  const entry = (played: typeof SHORT): ChallengeEntry => ({ board: BOARD, tag: 'tag1', challenge: WEEKLY.id, ...played });
  const entered = (played: typeof SHORT, at: number): ChallengeDoc => ({ ...(challengeUpdate(null, entry(played), at, false) as ChallengeDoc), verified: true, picks: [] });

  it('keeps the best run, a better one waiting beside it until checked', () => {
    const best = entered(SHORT, 1);
    expect(challengeUpdate(best, entry(SHORT), 2, true)).toBe('lower');
    const waiting = challengeUpdate(best, entry(LONG), 3, true) as ChallengeDoc;
    expect(waiting.score).toBe(best.score);
    expect(waiting.next?.at).toBe(3);
    expect(challengeUpdate(waiting, entry(LONG), 4, true)).toBe('lower');
    // refused: the best stands; passed: it takes the row
    expect(settleDoc(waiting, 3, null)).toEqual(best);
    expect(settleDoc(waiting, 3, [])).toMatchObject({ score: waiting.next!.score, at: 3, verified: true, replay: LONG.replay });
    expect(settleDoc(waiting, 99, [])).toBeUndefined();
  });

  it('replaces a first run still waiting with a better one, whose check alone counts', () => {
    const first = challengeUpdate(null, entry(SHORT), 1, true) as ChallengeDoc;
    const better = challengeUpdate(first, entry(LONG), 2, true) as ChallengeDoc;
    expect(better).toMatchObject({ state: 'pending', at: 2, replay: LONG.replay });
    expect(settleDoc(better, 1, [])).toBeUndefined();
  });
});

function setup(now = NOW) {
  const store = new MemoryStore();
  const resim = new ResimQueue(store, ENGINE_VERSION, () => now, () => {}, (fn) => setTimeout(fn, 0));
  const deps: Deps = { store, tagSalt: 'salt', adminKey: 'key', now: () => now, allow: () => true, resim, marks: new WeekMarks(store, () => now) };
  return { store, resim, deps };
}

const req = (method: string, path: string, body?: unknown, install = INSTALL): Req => ({ method, path, query: new URLSearchParams(), headers: { 'x-hk-install': install }, body, ip: '1.2.3.4' });
const send = (d: Deps, played: typeof SHORT) => route(req('POST', '/v1/challenge/runs', { challenge: WEEKLY.id, ...played }, played.run.install), d);
const board = async (d: Deps, install = INSTALL) => (await route(req('GET', `/v1/challenge/boards/${BOARD}`, undefined, install), d)).body as ChallengeBoardReply;

describe('weekly routes', () => {
  it('take the best of many runs, re-simulating the better one', async () => {
    const { deps, resim } = setup();
    expect((await send(deps, SHORT)).body).toMatchObject({ board: BOARD, status: 'pending', rank: 1, total: 1 });
    await resim.idle();
    expect((await send(deps, SHORT)).body).toMatchObject({ status: 'lower', rank: 1, total: 1 });
    expect((await send(deps, LONG)).body).toMatchObject({ status: 'pending', rank: 1, total: 1 });
    const meanwhile = await board(deps);
    expect(meanwhile).toMatchObject({ pending: true, total: 1 });
    expect(meanwhile.mine?.wave).toBe(SHORT.run.wave);
    await resim.idle();
    const after = await board(deps);
    expect(after.pending).toBe(false);
    expect(after.rows.map((r) => r.wave)).toEqual([LONG.run.wave]);
  });

  it('publish the top runs pick timelines and replays, and no others', async () => {
    const { deps, resim } = setup();
    const installs = ['install00001', 'install00002', 'install00003', 'install00004'];
    for (const [k, install] of installs.entries()) await send(deps, playRun(WEEKLY, 3000 - k * 400, install));
    await resim.idle();
    const b = await board(deps);
    expect(b.rows.length).toBe(4);
    expect(b.top!.map((t) => t.tag)).toEqual(b.rows.slice(0, WATCH_TOP).map((r) => r.tag));
    for (const t of b.top!) {
      expect(t.replay).toBe(true);
      expect(t.picks.length).toBeGreaterThan(0);
    }
    const watch = await route(req('GET', `/v1/challenge/boards/${BOARD}/replays/${b.rows[0].tag}`), deps);
    expect(watch.status).toBe(200);
    expect((watch.body as ReplayWire).tick).toBeGreaterThan(0);
    expect((await route(req('GET', `/v1/challenge/boards/${BOARD}/replays/${b.rows[3].tag}`), deps)).status).toBe(404);
    expect((await route(req('GET', `/v1/challenge/boards/${BOARD}/replays/nope`), deps)).status).toBe(404);
    expect((await route(req('GET', `/v1/challenge/boards/${BOARD}/oops/${b.rows[0].tag}`), deps)).status).toBe(404);
  });

  it("answer a closed week's rank, and mark last week's tiers on this week's boards", async () => {
    const { deps, resim, store } = setup();
    for (const [k, install] of ['install00001', 'install00002'].entries()) await send(deps, playRun(WEEKLY, 2400 - k * 600, install));
    await resim.idle();
    // a week later
    const later = NOW + WEEK_MS;
    const next: Deps = { ...deps, now: () => later, marks: new WeekMarks(store, () => later) };
    const closed = await board(next, 'install00002');
    expect(closed.mine).toMatchObject({ rank: 2 });
    expect(closed.total).toBe(2);
    const daily = (await route(req('GET', '/v1/boards/c1'), next)).body as BoardReply;
    expect(daily.rows).toEqual([]);
    expect(closed.rows.every((r) => r.mark === 3)).toBe(true);
    // in its own week, the board wears last week's marks, which nobody has
    expect((await board(deps)).rows.every((r) => r.mark === undefined)).toBe(true);
    expect(DAY_MS).toBeGreaterThan(0);
  });
});
