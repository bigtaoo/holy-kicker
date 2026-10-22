import { describe, expect, it, vi } from 'vitest';
import { ENGINE_VERSION, type SimState } from '@hk/engine';
import type { Challenge, ChallengeBoardReply, ChallengeList, ReplayWire } from '@hk/protocol';
import { newSave, type SaveData } from '../meta/save';
import type { Backend, RunResult } from '../net/backend';
import { dailySeed, ymdOf } from '@hk/protocol';
import { ChallengeFlow, localDaily } from './challengeFlow';

const HOUR = 3_600_000;
const START = 20_379 * 24 * HOUR;
const daily: Challenge = {
  id: 'd20261018', kind: 'daily', start: START, end: START + 24 * HOUR, seed: 7, chapter: 'furthest', waves: 50,
  mutator: null, loadout: null, engine: ENGINE_VERSION,
};
const WEEK = START - 5 * 24 * HOUR; // the Monday before
const weekly: Challenge = {
  id: 'w2026-42', kind: 'weekly', start: WEEK, end: WEEK + 7 * 24 * HOUR, seed: 9, chapter: 2, waves: 50, mutator: null,
  loadout: { relic: 'bowl', monk: 'fat', sutras: ['lotus'], chapter: 2 }, engine: ENGINE_VERSION,
};
const BOARD = `w2026-42-e${ENGINE_VERSION}-c2`;
const player: SaveData = { ...newSave(), level: 3, firstRunDone: true, cleared: 1 };
const run: RunResult = { chapter: 2, hard: false, won: false, wave: 8, tenths: 3000, level: 9, kills: 200, monk: 'kicker', relic: 'ball' };
const ended = { config: { chapter: 2 }, players: [{ spells: [], relicId: 'ball', awakened: false }] } as unknown as SimState;

/** A backend answering `list` (null: no answer). */
function fakeNet(list: ChallengeList | null) {
  return {
    online: true,
    challenges: vi.fn(async () => list),
    challengeBoard: vi.fn(async (_id: string): Promise<ChallengeBoardReply | null> => null),
    challengeReplay: vi.fn(async (_board: string, _tag: string): Promise<ReplayWire | null> => null),
    submitChallengeRun: vi.fn(async () => ({ board: 'b', status: 'pending' as const, rank: 1, total: 1, tag: 0 })),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('challenge flow', () => {
  it('shows nothing until the record comes, then the daily on the server clock', async () => {
    const net = fakeNet({ now: START + 20 * HOUR, challenges: [daily] });
    const changed = vi.fn();
    const flow = new ChallengeFlow(net as unknown as Backend, changed, false, false, () => START + 2 * HOUR);
    expect(flow.daily(player)).toBeNull();
    flow.refresh();
    await settle();
    expect(changed).toHaveBeenCalledOnce();
    // the device's clock is 18 hours behind the server's: 4 hours are left, not 22
    expect(flow.daily(player)).toMatchObject({ state: 'open', chapter: 2, hours: 4, reply: null });
    // a fresh record is not fetched again
    flow.refresh();
    expect(net.challenges).toHaveBeenCalledOnce();
  });

  it("makes the day's daily up offline or without an answer, and shows nothing below the unlock level or once the day closed", async () => {
    const offline = { ...fakeNet({ now: START, challenges: [daily] }), online: false };
    const changed = vi.fn();
    const a = new ChallengeFlow(offline as unknown as Backend, changed, false, false, () => START + HOUR);
    a.refresh();
    expect(offline.challenges).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce();
    // the server's record for the day: the same id, seed, waves and mutator
    expect(a.daily(player)).toMatchObject({ state: 'open', local: true, best: 0, hours: 23, challenge: localDaily(START) });
    expect(localDaily(START + HOUR)).toMatchObject({ id: `d${ymdOf(START)}`, start: START, end: daily.end, seed: dailySeed(ymdOf(START)), waves: 20 });
    // no board and no weekly offline
    expect(a.lobby(player, true, vi.fn(), vi.fn(), vi.fn())).toMatchObject({ board: null, watch: null, weekly: null });
    a.refresh();
    expect(changed).toHaveBeenCalledOnce();

    const net = fakeNet(null);
    const silent = new ChallengeFlow(net as unknown as Backend, () => {}, false, false, () => START);
    silent.refresh();
    await settle();
    expect(silent.daily(player)).toMatchObject({ local: true });
    // the server's record wins once it answers
    net.challenges.mockResolvedValue({ now: START, challenges: [daily, weekly] });
    silent.refresh();
    await settle();
    expect(net.challenges).toHaveBeenCalledOnce(); // asked again only after a minute
    const later = new ChallengeFlow(net as unknown as Backend, () => {}, false, false, () => START + 2 * 60_000);
    later.refresh();
    await settle();
    expect(later.daily(player)).toMatchObject({ local: false, challenge: daily });

    let now = START;
    const b = new ChallengeFlow(fakeNet({ now: START, challenges: [daily] }) as unknown as Backend, () => {}, false, false, () => now);
    b.refresh();
    await settle();
    expect(b.daily({ ...player, level: 1 })).toBeNull();
    now = daily.end;
    expect(b.daily(player)).toBeNull();
  });

  it("settles a made-up daily as the server's: paid once a day, its best kept, the streak grown", async () => {
    const offline = { ...fakeNet(null), online: false };
    const flow = new ChallengeFlow(offline as unknown as Backend, () => {}, false, false, () => START);
    flow.refresh();
    const c = flow.daily(player)!.challenge;
    flow.begin(c);
    const first = flow.settle({ ...player, streak: 2, streakDay: 20_378 }, ended, run, 12, 300, false);
    expect(first.reward).toMatchObject({ counted: true, streak: 3 });
    expect(first.local).toEqual({ before: 0 });
    expect(flow.daily(first.save)).toMatchObject({ state: 'done', best: 12, streak: 3 });
    flow.begin(c);
    const again = flow.settle(first.save, ended, run, 15, 300, false);
    expect(again.reward.counted).toBe(false);
    expect(again.local).toEqual({ before: 12 });
    expect(again.save.dailyBest.waves).toBe(15);
  });

  it('offers the board only to a player with a name on the boards', async () => {
    const flow = new ChallengeFlow(fakeNet({ now: START, challenges: [daily] }) as unknown as Backend, () => {}, false, false, () => START);
    flow.refresh();
    await settle();
    const play = vi.fn();
    expect(flow.lobby(player, false, play, vi.fn(), vi.fn())?.board).toBeNull();
    const lobby = flow.lobby(player, true, play, vi.fn(), vi.fn())!;
    expect(lobby.board).not.toBeNull();
    expect(lobby.watch).not.toBeNull();
    expect(lobby).toMatchObject({ daily: { chapter: 2 }, weekly: null, claim: null });
  });

  it('settles the run and sends only a counted, ranked run with its replay', async () => {
    const net = fakeNet({ now: START, challenges: [daily] });
    const flow = new ChallengeFlow(net as unknown as Backend, () => {}, false, false, () => START);
    flow.begin(daily);
    const first = flow.settle(player, ended, run, 7, 200, true);
    expect(flow.run).toBeNull();
    expect(first.reward.counted).toBe(true);
    expect(first.save.challenge).toBe(daily.id);
    expect(first).toMatchObject({ chapter: 2, waves: 7, hours: 24 });
    // no replay was taken (a resumed or too long run): nothing to verify, nothing sent
    expect(await first.reply).toBeNull();
    expect(net.submitChallengeRun).not.toHaveBeenCalled();
    // the day's later runs are practice
    flow.begin(daily);
    expect(flow.settle(first.save, ended, run, 9, 100, true).reward.counted).toBe(false);
  });
});

describe('weekly challenge flow', () => {
  const both = { now: START, challenges: [daily, weekly] };

  it('shows the weekly once chapter 1 is cleared, with the days and hours left and the best this week', async () => {
    const flow = new ChallengeFlow(fakeNet({ ...both, now: START + 3 * HOUR }) as unknown as Backend, () => {}, false, false, () => START);
    flow.refresh();
    await settle();
    expect(flow.weekly({ ...player, cleared: 0 })).toBeNull();
    expect(flow.weekly(player)).toMatchObject({ state: 'open', board: BOARD, best: 0, days: 1, hours: 21 });
    const played = { ...player, weeks: [{ id: weekly.id, board: BOARD, end: weekly.end, best: 17 }] };
    expect(flow.weekly(played)?.best).toBe(17);
    const later = new ChallengeFlow(fakeNet({ now: START, challenges: [{ ...weekly, engine: ENGINE_VERSION + 1 }] }) as unknown as Backend, () => {}, false, false, () => START);
    later.refresh();
    await settle();
    expect(later.weekly(player)?.state).toBe('update');
    expect(later.lobby(player, true, vi.fn(), vi.fn(), vi.fn())).toMatchObject({ daily: null, weekly: { state: 'update' } });
  });

  it('settles a weekly run into the week, keeping the best, paying nothing now', async () => {
    const flow = new ChallengeFlow(fakeNet(both) as unknown as Backend, () => {}, false, false, () => START);
    flow.begin(weekly);
    const first = flow.settle(player, ended, run, 12, 100, true);
    expect(first.weekly).toEqual({ before: 0 });
    expect(first.reward).toMatchObject({ counted: true, copper: 0, jade: 0 });
    expect(first.save.weeks).toEqual([{ id: weekly.id, board: BOARD, end: weekly.end, best: 12 }]);
    expect(first.save.jade).toBe(player.jade);
    flow.begin(weekly);
    const second = flow.settle(first.save, ended, run, 9, 100, true);
    expect(second.weekly).toEqual({ before: 12 });
    expect(second.save.weeks[0].best).toBe(12);
  });

  it('pays a closed week once its rank is in, asking once a session', async () => {
    const net = fakeNet(both);
    net.challengeBoard.mockResolvedValue({ rows: [], total: 40, mine: { rank: 3, tag: 'x' }, pending: false } as unknown as ChallengeBoardReply);
    const changed = vi.fn();
    const flow = new ChallengeFlow(net as unknown as Backend, changed, false, false, () => START);
    flow.refresh();
    await settle();
    const old = { id: 'w2026-41', board: `w2026-41-e${ENGINE_VERSION}-c1`, end: WEEK, best: 30 };
    const save = { ...player, weeks: [{ id: weekly.id, board: BOARD, end: weekly.end, best: 5 }, old] };
    const claimed = vi.fn();
    expect(flow.lobby(save, true, vi.fn(), vi.fn(), claimed)?.claim).toBeNull();
    await settle();
    expect(net.challengeBoard).toHaveBeenCalledWith(old.board);
    const lobby = flow.lobby(save, true, vi.fn(), vi.fn(), claimed)!;
    expect(lobby.claim).toMatchObject({ rank: 3, total: 40, tier: 3, jade: 130 });
    lobby.take(lobby.claim!);
    const paid = claimed.mock.calls[0][0] as SaveData;
    expect(paid.jade).toBe(save.jade + 130);
    expect(paid.weeks.map((w) => w.id)).toEqual([weekly.id]);
    // the open week is not asked about; the paid one is gone
    expect(flow.lobby(paid, true, vi.fn(), vi.fn(), claimed)?.claim).toBeNull();
    expect(net.challengeBoard).toHaveBeenCalledOnce();
  });

  it('waits on a board still pending, and pays taking part alone for a week never sent', async () => {
    const net = fakeNet(both);
    const flow = new ChallengeFlow(net as unknown as Backend, () => {}, false, false, () => START);
    flow.refresh();
    await settle();
    const old = { id: 'w2026-41', board: `w2026-41-e${ENGINE_VERSION}-c1`, end: WEEK, best: 30 };
    net.challengeBoard.mockResolvedValue({ rows: [], total: 40, pending: true } as unknown as ChallengeBoardReply);
    flow.lobby({ ...player, weeks: [old] }, true, vi.fn(), vi.fn(), vi.fn());
    await settle();
    expect(flow.lobby({ ...player, weeks: [old] }, true, vi.fn(), vi.fn(), vi.fn())?.claim ?? null).toBeNull();
    const fresh = new ChallengeFlow(net as unknown as Backend, () => {}, false, false, () => START);
    fresh.refresh();
    await settle();
    net.challengeBoard.mockResolvedValue({ rows: [], total: 40, pending: false } as unknown as ChallengeBoardReply);
    fresh.lobby({ ...player, weeks: [old] }, false, vi.fn(), vi.fn(), vi.fn());
    await settle();
    expect(fresh.lobby({ ...player, weeks: [old] }, false, vi.fn(), vi.fn(), vi.fn())?.claim).toMatchObject({ rank: 0, tier: 0, jade: 10 });
  });

  it('settles the open week at once under the dev switch, offline with a made-up rank', async () => {
    const net = { ...fakeNet(null), online: false };
    const flow = new ChallengeFlow(net as unknown as Backend, () => {}, true, true, () => START);
    flow.refresh();
    await settle();
    const wk = flow.weekly(player)!;
    expect(wk.challenge.loadout).not.toBeNull();
    const save = { ...player, weeks: [{ id: wk.challenge.id, board: wk.board, end: wk.challenge.end, best: 20 }] };
    flow.lobby(save, false, vi.fn(), vi.fn(), vi.fn());
    expect(flow.lobby(save, false, vi.fn(), vi.fn(), vi.fn())?.claim).toMatchObject({ rank: 2, total: 10, tier: 3 });
  });

  it('watches a top run only when its replay comes, on this engine', async () => {
    const net = fakeNet(both);
    const flow = new ChallengeFlow(net as unknown as Backend, () => {}, false, false, () => START);
    flow.refresh();
    await settle();
    const watch = vi.fn();
    const lobby = flow.lobby(player, true, vi.fn(), watch, vi.fn())!;
    const top = { tag: 'abc', picks: [], replay: true };
    expect(await lobby.watch!(BOARD, top, 'Ann')).toBe(false);
    net.challengeReplay.mockResolvedValue({ engine: ENGINE_VERSION + 1, config: {}, wave: 1, cmds: [], tick: 10, hash: 0 });
    expect(await lobby.watch!(BOARD, top, 'Ann')).toBe(false);
    net.challengeReplay.mockResolvedValue({ engine: ENGINE_VERSION, config: {}, wave: 1, cmds: [], tick: 10, hash: 0 });
    expect(await lobby.watch!(BOARD, top, 'Ann', 300)).toBe(true);
    expect(net.challengeReplay).toHaveBeenCalledWith(BOARD, 'abc');
    expect(watch).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ann', from: 300, picks: [] }));
  });
});
