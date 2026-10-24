import { afterEach, describe, expect, it, vi } from 'vitest';
import { challengeBoardId } from '@hk/protocol';
import { weeklyOf } from '../../../server/src/challenge';
import { t } from '../i18n';
import { API, boardServer } from '../testkit/boardServer';
import { lobbyRig } from '../testkit/lobbyRig';
import { endRun, tapWhenUp, type ShellRig } from '../testkit/testShell';
import { THEME } from '../theme';

// A challenge run's results as the player meets them on the real Shell, the server's router
// answering: a weekly's new best or the best that stands with the week's rank, a daily's share
// of its board, and a run the boards never got with the reason why.

afterEach(() => vi.unstubAllGlobals());

const WEEK = weeklyOf(Date.now());

/** Plays the open weekly (or the daily) to a fall at `wave`; the results' texts once `ready` holds. */
async function fallAt(rig: ShellRig, kind: 'weekly' | 'daily', wave: number, ready: (texts: string[]) => boolean): Promise<string[]> {
  await tapWhenUp(rig, 'challenge.tile');
  if (kind === 'weekly') {
    await tapWhenUp(rig, 'weekly.tab');
    await rig.until(() => rig.texts().includes(t('weekly.loadout')));
  }
  await tapWhenUp(rig, 'lobby.play');
  await rig.until(() => rig.shell.place() === 'run');
  const s = rig.shell.run!.engine.state;
  s.wave = wave;
  s.tick = wave * 10 * 30; // ten seconds a wave: a time the server takes for that wave
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results');
  await rig.until(() => ready(rig.texts()));
  return rig.texts();
}

describe('challenge results', { timeout: 30000 }, () => {
  it("a weekly's first run: a new best, the week's rank once the server answers, the check under way, rewards at the week's end", async () => {
    const srv = boardServer();
    for (const i of [0, 1]) await srv.challengeRun(WEEK, `player-top-${i}`, 1500);
    const rig = await lobbyRig({}, { api: API });
    const texts = await fallAt(rig, 'weekly', 2, (x) => x.some((s) => s.startsWith(t('weekly.rank', { rank: 9, total: 9 }).split('9')[0])));
    expect(texts).toContain(t('weekly.title'));
    expect(texts).toContain(t('weekly.newBest'));
    expect(texts).toContain(t('weekly.rank', { rank: 3, total: 3 }));
    expect(texts).toContain(t('challenge.checking'));
    expect(texts).toContain(t('weekly.after'));
    expect(srv.calls).toContain('POST /v1/challenge/runs');
    expect(rig.store.load().weeks[0]).toMatchObject({ id: WEEK.id, best: 1 }) // waves cleared;
    await tapWhenUp(rig, 'common.continue');
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(rig.faults).toEqual([]);
  });

  it("a weekly run below the week's best: the best stands", async () => {
    boardServer();
    // a week on the player's furthest chapter plays chapter 2 here (chapter 1 cleared)
    const board = challengeBoardId(WEEK.id, WEEK.engine, WEEK.chapter === 'furthest' ? 2 : WEEK.chapter, THEME);
    const rig = await lobbyRig({ weeks: [{ id: WEEK.id, board, end: WEEK.end, best: 12 }] }, { api: API });
    const texts = await fallAt(rig, 'weekly', 3, (x) => x.includes(t('weekly.bestStands', { wave: 12 })));
    expect(texts).not.toContain(t('weekly.newBest'));
    expect(rig.store.load().weeks[0].best).toBe(12);
  });

  it("the daily's counted run: its share of the board and the next challenge's hours", async () => {
    boardServer();
    const rig = await lobbyRig({}, { api: API });
    const texts = await fallAt(rig, 'daily', 6, (x) => x.includes(t('challenge.top', { n: 100 })));
    expect(texts).toContain(t('challenge.title'));
    expect(texts.some((s) => s.startsWith(t('challenge.next', { h: 99 }).split('99')[0]))).toBe(true);
    expect(texts).not.toContain(t('challenge.practiceNote'));
  });

  it('with the leaderboards off in Settings, a weekly run says why it has no rank, and nothing is sent', async () => {
    const srv = boardServer();
    const rig = await lobbyRig({}, { api: API });
    rig.privacy.setBoards(false);
    const texts = await fallAt(rig, 'weekly', 2, (x) => x.includes(t('weekly.after')));
    await rig.tick(5);
    expect(rig.texts()).toContain(t('results.rankOff'));
    expect(texts).toContain(t('weekly.newBest'));
    expect(srv.calls).not.toContain('POST /v1/challenge/runs');
  });

  it("with the leaderboards off, the daily's results say so too", async () => {
    boardServer();
    const rig = await lobbyRig({}, { api: API });
    rig.privacy.setBoards(false);
    await fallAt(rig, 'daily', 6, (x) => x.includes(t('challenge.title')));
    await rig.tick(5);
    expect(rig.texts()).toContain(t('results.rankOff'));
  });
});
