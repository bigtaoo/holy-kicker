import { afterEach, describe, expect, it, vi } from 'vitest';
import { packDice } from '@hk/protocol';
import { t } from '../i18n';
import { chapterName } from '../i18n/chapterName';
import { API, boardServer, type BoardServer } from '../testkit/boardServer';
import { lobbyRig } from '../testkit/lobbyRig';
import { findTap, tapWhenUp, type ShellRig } from '../testkit/testShell';
import { diceName } from './boardPanel';

// The chapter boards as a player meets them: the Ranks button on the lobby's chapter card opens
// the board of that chapter and mode, which the server's own router answers (testkit/boardServer.ts).

afterEach(() => vi.unstubAllGlobals());

/** Dice name `i` of the seeded players, the same one the board shows. */
const dice = (i: number) => packDice(i % 16, (i * 3) % 16, 10 + i);

/** `n` other players' runs on chapter 2 (the card the lobby shows a player past chapter 1): the first ones clear it (fastest first), the rest fall at lower waves. */
async function seed(srv: BoardServer, n: number, clears = 3, hard = false, chapter = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    const won = i < clears;
    await srv.run(`player-${i}`, { chapter, hard, won, wave: won ? 50 : 45 - i, tenths: won ? 9000 + i * 100 : 8000, dice: dice(i) });
  }
}

async function openBoard(rig: ShellRig): Promise<void> {
  await tapWhenUp(rig, 'board.button');
  await rig.until(() => !rig.texts().includes(t('board.loading')));
}

/** Closes the open board with its Back button. */
async function closeBoard(rig: ShellRig): Promise<void> {
  await tapWhenUp(rig, 'common.back');
  await rig.until(() => !rig.texts().includes(t('board.button')) || findTap(rig.app.stage, t('board.button')) !== null);
}

describe('chapter boards', () => {
  it('the chapter card opens its board: the title and mode, the ranked rows, clears as times, the size', async () => {
    const srv = boardServer();
    await seed(srv, 5);
    const rig = await lobbyRig({}, { api: API });
    await openBoard(rig);
    const texts = rig.texts();
    expect(texts).toContain(t('board.title', { n: 2, name: chapterName(2) }));
    expect(texts).toContain(t('lobby.normal'));
    // the fastest clear first, a time to the tenth; the falls after, by wave
    expect(texts.indexOf(diceName(dice(0)))).toBeLessThan(texts.indexOf(diceName(dice(1))));
    expect(texts).toContain('15:00.0');
    expect(texts).toContain(t('board.wave', { wave: 42 }));
    expect(texts).toContain(t('board.total', { n: 5 }));
    expect(srv.calls).toContain('GET /v1/boards/c2');
    expect(rig.faults).toEqual([]);
  });

  it('the mode switched to hard opens the hard board', async () => {
    const srv = boardServer();
    await seed(srv, 2, 0, false, 1);
    await seed(srv, 1, 1, true, 1);
    // chapter 1, cleared with three stars: its hard mode is open
    const rig = await lobbyRig({ chapter: 1, stars: [3] }, { api: API });
    await tapWhenUp(rig, 'lobby.hard');
    await rig.until(() => rig.texts().includes(t('lobby.hardTitle', { n: 1, name: chapterName(1) })));
    await openBoard(rig);
    const texts = rig.texts();
    expect(texts).toContain(t('lobby.hard'));
    expect(texts).toContain(t('board.total', { n: 1 }));
    expect(srv.calls.some((c) => c.startsWith('GET /v1/boards/c1h'))).toBe(true);
  });

  it("the player's own run: marked on the list, or on a band of its own under it", async () => {
    const srv = boardServer();
    await seed(srv, 25);
    const rig = await lobbyRig({}, { api: API });
    const me = rig.net.install;
    await srv.run(me, { chapter: 2, won: false, wave: 44, tenths: 8000, dice: dice(40) });
    await openBoard(rig);
    const mine = t('board.you', { name: diceName(dice(40)) });
    let texts = rig.texts();
    expect(texts).toContain(mine);
    // rank 3 clears, then 45-3=42 down: the player's 44 is between them; the board's size stays
    expect(texts).toContain(t('board.total', { n: 26 }));
    await closeBoard(rig);
    // a fall at wave 2: rank 26, under the 20 rows, with no size line under it
    const low = boardServer();
    await seed(low, 25);
    await low.run(me, { chapter: 2, won: false, wave: 2, tenths: 100, dice: dice(40) });
    await openBoard(rig);
    texts = rig.texts();
    expect(texts).toContain(mine);
    expect(texts).toContain('26');
    expect(texts).not.toContain(t('board.total', { n: 26 }));
    expect(rig.faults).toEqual([]);
  });

  it('an empty board asks to be first', async () => {
    boardServer();
    const rig = await lobbyRig({}, { api: API });
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.empty'));
  });

  it('Back closes the board, and the next open fetches it again', async () => {
    const srv = boardServer();
    const rig = await lobbyRig({}, { api: API });
    await openBoard(rig);
    await closeBoard(rig);
    expect(rig.texts()).not.toContain(t('board.empty'));
    await seed(srv, 1);
    await openBoard(rig);
    expect(rig.texts()).toContain(t('board.total', { n: 1 }));
    expect(srv.calls.filter((c) => c === 'GET /v1/boards/c2')).toHaveLength(2);
  });
});
