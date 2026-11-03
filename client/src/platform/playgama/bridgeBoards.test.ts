import { describe, expect, it } from 'vitest';
import { PlaygamaBridge, type BridgeShape } from './bridge';
import { BridgeBoards, WEEKLY, bridgeBoards, weeklyScore } from './bridgeBoards';

const lost = (wave: number, tenths = 6000) => ({ won: false, wave, tenths });

describe('Playgama weekly board', () => {
  it('ranks a later week above any run of an earlier one', () => {
    expect(weeklyScore('w2026-46', lost(1, 99_999))!).toBeGreaterThan(weeklyScore('w2026-45', { won: true, wave: 50, tenths: 100 })!);
    expect(weeklyScore('w2027-01', lost(1))!).toBeGreaterThan(weeklyScore('w2026-53', { won: true, wave: 50, tenths: 100 })!);
  });

  it('ranks a clear, then waves, then less time', () => {
    const w = 'w2026-45';
    expect(weeklyScore(w, { won: true, wave: 50, tenths: 30_000 })!).toBeGreaterThan(weeklyScore(w, lost(50, 100))!);
    expect(weeklyScore(w, lost(21, 9000))!).toBeGreaterThan(weeklyScore(w, lost(20, 100))!);
    expect(weeklyScore(w, lost(20, 7000))!).toBeGreaterThan(weeklyScore(w, lost(20, 7100))!);
    expect(weeklyScore('w2066-01', { won: true, wave: 50, tenths: 0 })!).toBeLessThan(2 ** 31);
  });

  it('takes no week it cannot read', () => {
    expect(weeklyScore('d2026-11-03', lost(5))).toBeNull();
  });

  it('sends only a run better than the session best', () => {
    const sent: [string, number][] = [];
    const boards = new BridgeBoards({ setScore: (id, s) => void sent.push([id, s]) });
    boards.weekly('w2026-45', lost(20));
    boards.weekly('w2026-45', lost(19));
    boards.weekly('w2026-45', lost(30));
    boards.weekly('nope', lost(40));
    expect(sent).toEqual([[WEEKLY, weeklyScore('w2026-45', lost(20))], [WEEKLY, weeklyScore('w2026-45', lost(30))]]);
  });

  it('exists only where the game draws Bridge boards', async () => {
    const calls: unknown[][] = [];
    const sdk: BridgeShape = { initialize: () => undefined, leaderboards: { type: 'in_game', setScore: (...a) => void calls.push(a) } };
    const bridge = new PlaygamaBridge({ bridge: sdk }, () => new Promise(() => {}));
    await bridge.init();
    bridgeBoards(bridge)!.weekly('w2026-45', lost(3));
    expect(calls).toEqual([[WEEKLY, weeklyScore('w2026-45', lost(3))]]);
    sdk.leaderboards!.type = 'external';
    expect(bridgeBoards(bridge)).toBeUndefined();
  });
});
