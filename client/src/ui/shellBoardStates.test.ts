import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { API, boardServer, type BoardServer } from '../testkit/boardServer';
import { lobbyRig } from '../testkit/lobbyRig';
import { endRun, findTap, tapLabel, tapWhenUp, type ShellRig } from '../testkit/testShell';
import { diceName } from './boardPanel';

// What the chapter board says when it cannot show the player's run, or anything: the boards
// turned off, the consent region, no backend, a link that fails or never answers, and the
// player's own run held for its check, refused by it, or still waiting on the device.

afterEach(() => vi.unstubAllGlobals());

/** Two other players on chapter 2's board. */
async function seeded(): Promise<BoardServer> {
  const srv = boardServer();
  for (const i of [1, 2]) await srv.run(`player-${i}`, { chapter: 2, wave: 20 + i, dice: 0x1010 + i });
  return srv;
}

async function openBoard(rig: ShellRig): Promise<void> {
  await tapWhenUp(rig, 'board.button');
  await rig.until(() => !rig.texts().includes(t('board.loading')));
}

/** A results line about the board: the rank (`#3`, checking or not), or why there is none. */
function isRankLine(s: string): boolean {
  const misses = (['results.rankOff', 'results.rankQueued', 'results.rankUnverified'] as const).map((k) => t(k));
  const ranks = (['results.rankNew', 'results.rankShort', 'results.rankPending'] as const).map((k) => t(k, { rank: 0 }).split('0')[0]);
  return misses.includes(s) || ranks.some((r) => s.startsWith(r));
}

/** Plays chapter 2 to a fall at `wave` and comes back to the lobby; the results' rank line is returned. */
async function fallAt(rig: ShellRig, wave: number): Promise<string[]> {
  await tapWhenUp(rig, 'lobby.play');
  await rig.until(() => rig.shell.place() === 'run');
  const s = rig.shell.run!.engine.state;
  s.wave = wave;
  s.tick = wave * 10 * 30; // ten seconds a wave: a time the server takes for that wave
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results');
  await rig.until(() => rig.texts().some(isRankLine));
  const texts = rig.texts();
  const collect = texts.find((s) => s.startsWith(t('results.collect', { n: 0 }).split('0')[0]));
  if (collect) tapLabel(rig.app.stage, 'results.collect', { n: Number(/\d+/.exec(collect)![0]) });
  else tapLabel(rig.app.stage, 'results.lobby');
  await rig.until(() => rig.shell.place() === 'lobby');
  await rig.tick(2);
  return texts;
}

describe('board states', () => {
  it('offline (no backend) the chapter card has no Ranks button', async () => {
    const rig = await lobbyRig();
    await rig.tick(5);
    expect(findTap(rig.app.stage, t('board.button'))).toBeNull();
  });

  it('in the consent region the boards still open before any answer on the stats', async () => {
    await seeded();
    const rig = await lobbyRig({}, { api: API, timeZone: 'Europe/Berlin' });
    expect(rig.privacy.sharing()).toBe(false);
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.total', { n: 2 }));
  });

  it('the boards turned off in Settings: the board still shows, and says why the runs are not on it', async () => {
    const srv = await seeded();
    const rig = await lobbyRig({}, { api: API });
    rig.privacy.setBoards(false);
    const results = await fallAt(rig, 30);
    expect(results).toContain(t('results.rankOff'));
    expect(srv.calls.filter((c) => c === 'POST /v1/runs')).toHaveLength(0);
    await openBoard(rig);
    const texts = rig.texts();
    expect(texts).toContain(t('board.off'));
    expect(texts).not.toContain(t('board.total', { n: 2 }));
    expect(rig.faults).toEqual([]);
  });

  it('a failing server, or no network: the board says it is out of reach, and opens again once back', async () => {
    const srv = await seeded();
    const rig = await lobbyRig({}, { api: API });
    srv.link = 'fail';
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.failed'));
    await tapWhenUp(rig, 'common.back');
    srv.link = 'down';
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.failed'));
    await tapWhenUp(rig, 'common.back');
    srv.link = 'up';
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.total', { n: 2 }));
    expect(rig.faults).toEqual([]);
  });

  it('a board that never answers stays on Loading; Back closes it and the late answer does not open it again', async () => {
    const srv = await seeded();
    const rig = await lobbyRig({}, { api: API });
    srv.link = 'hang';
    await tapWhenUp(rig, 'board.button');
    await rig.tick(30);
    expect(rig.texts()).toContain(t('board.loading'));
    await tapWhenUp(rig, 'common.back');
    await rig.until(() => !rig.texts().includes(t('board.loading')));
    srv.link = 'up';
    await srv.release();
    await rig.tick(10);
    expect(rig.texts()).not.toContain(t('board.total', { n: 2 }));
    expect(rig.shell.place()).toBe('lobby');
  });

  it("a run the server still checks: the results say so, and the board shows the others with the player's note", async () => {
    const srv = await seeded();
    srv.verdict = () => 'hold';
    const rig = await lobbyRig({}, { api: API });
    const results = await fallAt(rig, 30);
    expect(results).toContain(t('results.rankPending', { rank: 1 }));
    await openBoard(rig);
    const texts = rig.texts();
    expect(texts).toContain(t('board.pending'));
    expect(texts).toContain(diceName(0x1012));
  });

  it("a run the check refused: the player's note says it is not ranked", async () => {
    const srv = await seeded();
    srv.verdict = () => 'refuse';
    const rig = await lobbyRig({}, { api: API });
    await fallAt(rig, 30);
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.refused'));
  });

  it('a run that could not be sent waits on the device: the results and the board say it goes again', async () => {
    const srv = await seeded();
    const rig = await lobbyRig({}, { api: API });
    srv.posts = 'down';
    const results = await fallAt(rig, 30);
    expect(results).toContain(t('results.rankQueued'));
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.queued'));
    await tapWhenUp(rig, 'common.back');
    // back online: the next open sends it first, and the server has it to check
    srv.posts = null;
    await openBoard(rig);
    expect(rig.texts()).not.toContain(t('board.queued'));
    expect(rig.texts()).toContain(t('board.pending'));
    await tapWhenUp(rig, 'common.back');
    // checked: the player's run leads the board
    await openBoard(rig);
    const texts = rig.texts();
    expect(texts).toContain(t('board.you', { name: diceName(rig.store.load().dice) }));
    expect(texts).toContain(t('board.total', { n: 3 }));
    expect(rig.faults).toEqual([]);
  });
});
