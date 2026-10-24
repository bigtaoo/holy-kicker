import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { packDice, type Challenge } from '@hk/protocol';
import { weeklyOf } from '../../../server/src/challenge';
import { t } from '../i18n';
import { API, boardServer, type BoardServer } from '../testkit/boardServer';
import { lobbyRig, reload } from '../testkit/lobbyRig';
import { BALANCE } from '../meta/balance';
import { weekClaim } from '../meta/weekly';
import { findTap, tap, tapWhenUp, textsIn, type ShellRig } from '../testkit/testShell';
import { diceName } from './boardPanel';

// The weekly challenge's board as a player meets it: the challenge panel's weekly tab, Ranks,
// the top runs with their Watch buttons and the chosen one's pick timeline, and a top run's
// replay watched to its end with the timeline ringing the pick the replay has reached. The top
// runs are real bot runs the server re-simulated, so their picks and replays are its own.

afterEach(() => vi.unstubAllGlobals());

const WEEK: Challenge = weeklyOf(Date.now());
/** Three players' runs this week, the longest first: ticks played, and their dice names. */
const TOPS = [{ ticks: 1500, dice: packDice(1, 2, 31) }, { ticks: 900, dice: packDice(3, 4, 42) }, { ticks: 450, dice: packDice(5, 6, 53) }];
let replays: { board: string; ticks: number }[] = [];

/** The week's server with the three top runs on it (re-simulated, so watchable). */
async function week(): Promise<BoardServer> {
  const srv = boardServer();
  replays = [];
  for (const [i, top] of TOPS.entries()) {
    const { board, replay } = await srv.challengeRun(WEEK, `player-top-${i}`, top.ticks, top.dice);
    replays.push({ board, ticks: replay.tick });
  }
  return srv;
}

/** The lobby of a player past chapter 1, with the weekly board open. */
async function weeklyBoard(): Promise<ShellRig> {
  const rig = await lobbyRig({}, { api: API });
  await tapWhenUp(rig, 'challenge.tile');
  await tapWhenUp(rig, 'weekly.tab');
  await rig.until(() => rig.texts().includes(t('weekly.loadout')));
  await tapWhenUp(rig, 'board.button');
  await rig.until(() => rig.texts().includes(t('weekly.watch')));
  return rig;
}

/** Taps the top run's Watch button (the first row's). */
async function watchTop(rig: ShellRig): Promise<void> {
  const label = t('weekly.watch');
  const buttons = findAll(rig.app.stage, (c) => c.eventMode === 'static' && textsIn(c).includes(label) && !c.children.some((k) => k instanceof Container && textsIn(k).includes(label) && k.eventMode === 'static'));
  tap(buttons[0]);
  await rig.until(() => rig.texts().includes(t('weekly.replayOf', { name: diceName(TOPS[0].dice) })));
}

/** The pick cells the replay has not reached yet (drawn faded). */
function faded(rig: ShellRig): number {
  let n = 0;
  const walk = (c: Container) => {
    if (c.alpha === 0.45 && c.hitArea) n++;
    for (const k of c.children) if (k instanceof Container) walk(k);
  };
  walk(rig.app.stage);
  return n;
}

beforeAll(() => {
  // the weekly opens once chapter 1 is cleared; the week here is the one the server has open
  expect(WEEK.loadout).toBeTruthy();
});

describe("the weekly board", { timeout: 30000 }, () => {
  it('lists the top runs with a Watch button each and the first one\'s picks; a tap on a top row shows its picks', async () => {
    const srv = await week();
    srv.marks.set(srv.tag('player-top-1'), 3);
    const rig = await weeklyBoard();
    const texts = rig.texts();
    expect(texts).toContain(t('weekly.title'));
    for (const top of TOPS) expect(texts).toContain(diceName(top.dice));
    expect(texts.filter((s) => s === t('weekly.watch'))).toHaveLength(3);
    expect(texts).toContain(t('weekly.picks', { name: diceName(TOPS[0].dice) }));
    expect(srv.calls).toContain(`GET /v1/challenge/boards/${replays[0].board}`);
    // the second row chosen: its picks under the board
    tap(findTap(rig.app.stage, diceName(TOPS[1].dice))!);
    await rig.tick(2);
    expect(rig.texts()).toContain(t('weekly.picks', { name: diceName(TOPS[1].dice) }));
    expect(rig.faults).toEqual([]);
  });

  it('a Watch that fails says Try again, and the board stays', async () => {
    const srv = await week();
    const rig = await weeklyBoard();
    srv.link = 'fail';
    await tapWhenUp(rig, 'weekly.watch');
    await rig.until(() => rig.texts().includes(t('weekly.failed')));
    expect(rig.texts()).toContain(t('weekly.title'));
    expect(rig.shell.place()).toBe('lobby');
  });

  it("watches a top run: whose it is, the wave, pause and play, the speeds, a wave on and back, through to its end and again, then Back", async () => {
    await week();
    const rig = await weeklyBoard();
    await watchTop(rig);
    expect(rig.texts()).toContain(t('board.wave', { wave: 1 }));
    // every pick still ahead at the start, the first ringed once the replay reaches it
    const before = faded(rig);
    expect(before).toBeGreaterThan(0);
    await tapWhenUp(rig, 'weekly.pause');
    await rig.until(() => rig.texts().includes(t('weekly.play')));
    await tapWhenUp(rig, 'weekly.play');
    await tapWhenUp(rig, 'weekly.speed', { n: 1 });
    await tapWhenUp(rig, 'weekly.speed', { n: 2 });
    await rig.until(() => rig.texts().includes(t('weekly.speed', { n: 4 })));
    // a wave on: skipping, then the next wave
    await tapWhenUp(rig, 'weekly.nextWave');
    await rig.until(() => rig.texts().includes(t('board.wave', { wave: 2 })));
    expect(faded(rig)).toBeLessThan(before);
    await tapWhenUp(rig, 'weekly.prevWave');
    await rig.until(() => rig.texts().includes(t('board.wave', { wave: 1 })));
    // played on at 4x to its end
    await rig.until(() => rig.texts().includes(t('weekly.ended')), 1000);
    expect(faded(rig)).toBe(0);
    await tapWhenUp(rig, 'weekly.again');
    await rig.until(() => rig.texts().includes(t('board.wave', { wave: 1 })));
    await tapWhenUp(rig, 'common.back');
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(rig.faults).toEqual([]);
  });

  it("a tap on a pick under the board watches that run from there, every pick before it reached", async () => {
    const srv = await week();
    const rig = await weeklyBoard();
    const top = (await srv.store.challengeBoard(replays[0].board, 10, null)).top!;
    const picks = top[0].picks;
    expect(picks.length).toBeGreaterThan(2);
    const last = picks[picks.length - 1];
    // the last pick on the board's timeline: its wave is the cell's number
    const cells = findAll(rig.app.stage, (c) => !!c.hitArea && c.eventMode === 'static' && c.cursor === 'pointer');
    tap(cells[cells.length - 1]);
    await rig.until(() => rig.texts().includes(t('weekly.replayOf', { name: diceName(TOPS[0].dice) })));
    await rig.until(() => rig.texts().includes(t('board.wave', { wave: last.wave })) && !rig.texts().includes(t('weekly.seeking')), 1000);
    expect(faded(rig)).toBe(0);
    expect(rig.faults).toEqual([]);
  });

  it('the keys: Space pauses and plays, the arrows go a wave on and back, Escape goes back', async () => {
    await week();
    const rig = await weeklyBoard();
    await watchTop(rig);
    const key = (code: string) => rig.platform.press(code);
    key('Space');
    await rig.until(() => rig.texts().includes(t('weekly.play')));
    key('Space');
    await rig.until(() => rig.texts().includes(t('weekly.pause')));
    key('ArrowRight');
    await rig.until(() => rig.texts().includes(t('board.wave', { wave: 2 })));
    key('ArrowLeft');
    await rig.until(() => rig.texts().includes(t('board.wave', { wave: 1 })));
    key('Escape');
    await rig.until(() => rig.shell.place() === 'lobby');
  });
});

function findAll(root: Container, ok: (c: Container) => boolean): Container[] {
  const out: Container[] = [];
  const walk = (c: Container) => {
    if (ok(c)) out.push(c);
    for (const k of c.children) if (k instanceof Container) walk(k);
  };
  walk(root);
  return out;
}

describe('the reward card of a closed week', { timeout: 30000 }, () => {
  const DAY = 24 * 3600 * 1000;
  /** Two weeks back: closed, and past its late window whatever the day today. */
  const PAST = weeklyOf(Date.now() - 14 * DAY);

  /** The server with three players' runs on the closed week, on its clock while it was open. */
  async function closedWeek(): Promise<{ srv: BoardServer; board: string; open: (on: boolean) => void }> {
    let clock = PAST.start + DAY;
    const srv = boardServer(() => clock);
    let board = '';
    for (const [i, top] of TOPS.entries()) board = (await srv.challengeRun(PAST, `player-top-${i}`, top.ticks, top.dice)).board;
    return { srv, board, open: (on) => (clock = on ? PAST.start + DAY : Date.now()) };
  }

  it("pays the player's rank on that week's board, once: the jade in, the week gone from the save", async () => {
    const { srv, board, open } = await closedWeek();
    open(false);
    const entry = { id: PAST.id, board, end: PAST.end, best: 4 };
    const first = await lobbyRig({ weeks: [entry] }, { api: API });
    // the player's own run that week, sent while it was open, among the others on the board
    open(true);
    await srv.challengeRun(PAST, first.net.install, 1200);
    open(false);
    const mine = (await srv.store.challengeBoard(board, 10, srv.tag(first.net.install))).mine!.rank;
    expect(mine).toBeGreaterThan(1);
    const rig = await reload(first, { api: API });
    const rank = t('weekly.claimRank', { rank: mine, total: 4 });
    await rig.until(() => rig.texts().includes(rank));
    expect(rig.texts()).toContain(t('weekly.claimTitle'));
    expect(srv.calls).toContain(`GET /v1/challenge/boards/${board}`);
    const jade = rig.store.load().jade;
    const paid = weekClaim(entry, mine, 4).jade;
    expect(paid).toBeGreaterThan(BALANCE.challenge.weekly.participation);
    await tapWhenUp(rig, 'weekly.claim');
    await rig.until(() => !rig.texts().includes(rank));
    expect(rig.store.load().jade).toBe(jade + paid);
    expect(rig.store.load().weeks).toEqual([]);
    expect(rig.faults).toEqual([]);
  });

  it('a closed week without a run of the player on its board pays taking part alone', async () => {
    const { board, open } = await closedWeek();
    open(false);
    const entry = { id: PAST.id, board, end: PAST.end, best: 2 };
    const rig = await lobbyRig({ weeks: [entry] }, { api: API });
    await rig.until(() => rig.texts().includes(t('weekly.claimNoRank')));
    const jade = rig.store.load().jade;
    await tapWhenUp(rig, 'weekly.claim');
    await rig.until(() => !rig.texts().includes(t('weekly.claimNoRank')));
    expect(rig.store.load().jade).toBe(jade + BALANCE.challenge.weekly.participation);
  });

  it('a week whose board is out of reach asks again at the next launch, and pays then', async () => {
    const { srv, board, open } = await closedWeek();
    open(false);
    srv.link = 'fail';
    const first = await lobbyRig({ weeks: [{ id: PAST.id, board, end: PAST.end, best: 2 }] }, { api: API });
    await first.tick(20);
    expect(first.texts()).not.toContain(t('weekly.claimTitle'));
    srv.link = 'up';
    const rig = await reload(first, { api: API });
    await rig.until(() => rig.texts().includes(t('weekly.claimTitle')));
  });
});
