import { describe, expect, it, vi } from 'vitest';
import { ENGINE_VERSION, type SimState } from '@hk/engine';
import type { Challenge, ChallengeList } from '@hk/protocol';
import { newSave, type SaveData } from '../meta/save';
import type { Backend, RunResult } from '../net/backend';
import { ChallengeFlow } from './challengeFlow';

const HOUR = 3_600_000;
const START = 20_379 * 24 * HOUR;
const daily: Challenge = {
  id: 'd20261018', kind: 'daily', start: START, end: START + 24 * HOUR, seed: 7, chapter: 'furthest', waves: 50,
  mutator: null, loadout: null, engine: ENGINE_VERSION,
};
const player: SaveData = { ...newSave(), level: 3, firstRunDone: true, cleared: 1 };
const run: RunResult = { chapter: 2, hard: false, won: false, wave: 8, tenths: 3000, level: 9, kills: 200, monk: 'kicker', relic: 'ball' };
const ended = { config: { chapter: 2 }, players: [{ spells: [], relicId: 'ball', awakened: false }] } as unknown as SimState;

/** A backend answering `list` (null: no answer). */
function fakeNet(list: ChallengeList | null) {
  return {
    online: true,
    challenges: vi.fn(async () => list),
    challengeBoard: vi.fn(async () => null),
    submitChallengeRun: vi.fn(async () => ({ board: 'b', status: 'pending' as const, rank: 1, total: 1, tag: 0 })),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('challenge flow', () => {
  it('shows nothing until the record comes, then the daily on the server clock', async () => {
    const net = fakeNet({ now: START + 20 * HOUR, challenges: [daily] });
    const changed = vi.fn();
    const flow = new ChallengeFlow(net as unknown as Backend, changed, false, () => START + 2 * HOUR);
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

  it('shows nothing offline, without an answer, below the unlock level or once the day closed', async () => {
    const offline = { ...fakeNet({ now: START, challenges: [daily] }), online: false };
    const a = new ChallengeFlow(offline as unknown as Backend, () => {}, false, () => START);
    a.refresh();
    await settle();
    expect(offline.challenges).not.toHaveBeenCalled();
    expect(a.daily(player)).toBeNull();

    const silent = new ChallengeFlow(fakeNet(null) as unknown as Backend, () => {}, false, () => START);
    silent.refresh();
    await settle();
    expect(silent.daily(player)).toBeNull();

    let now = START;
    const b = new ChallengeFlow(fakeNet({ now: START, challenges: [daily] }) as unknown as Backend, () => {}, false, () => now);
    b.refresh();
    await settle();
    expect(b.daily({ ...player, level: 1 })).toBeNull();
    now = daily.end;
    expect(b.daily(player)).toBeNull();
  });

  it('offers the board only to a player with a name on the boards', async () => {
    const flow = new ChallengeFlow(fakeNet({ now: START, challenges: [daily] }) as unknown as Backend, () => {}, false, () => START);
    flow.refresh();
    await settle();
    const play = vi.fn();
    expect(flow.lobby(player, false, play)?.board).toBeNull();
    const lobby = flow.lobby(player, true, play)!;
    expect(lobby.board).not.toBeNull();
    lobby.play();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ chapter: 2, challenge: daily }));
  });

  it('settles the run and sends only a counted, ranked run with its replay', async () => {
    const net = fakeNet({ now: START, challenges: [daily] });
    const flow = new ChallengeFlow(net as unknown as Backend, () => {}, false, () => START);
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
