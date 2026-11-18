import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { arenaCopper } from '../meta/arena';
import { clockTenths } from './clearTime';
import { newSave } from '../meta/save';
import { lobbyRig } from '../testkit/lobbyRig';
import { clearedChapterOne, endRun, findTap, rawKeys, tap, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';

// The arena on the real Shell: the lobby's switch shows its card once chapter 1 is cleared, PLAY
// starts an endless walled run with no revive, and its fall shows the arena results, which pay the
// copper for the time survived, keep the best and go back to the lobby or into another arena run.

/** The arena's run in play falls at `wave` after `tenths`; any revive offer is turned down. */
async function fall(rig: ShellRig, wave: number, tenths: number): Promise<void> {
  await rig.until(() => rig.shell.place() === 'run');
  const s = rig.shell.run!.engine.state;
  s.wave = wave;
  s.tick = tenths * 3;
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results' || findTap(rig.app.stage, t('run.giveUp')) !== null);
  if (rig.shell.place() === 'run') tap(findTap(rig.app.stage, t('run.giveUp'))!);
  await rig.until(() => rig.shell.place() === 'results');
  await rig.tick(30);
}

describe('the arena', { timeout: 30000 }, () => {
  it('is not on the switch before the first clear', async () => {
    const rig = await lobbyRig({ cleared: 0, chapter: 1, best: newSave().best });
    await rig.until(() => findTap(rig.app.stage, 'play') !== null);
    expect(rig.texts()).not.toContain(t('arena.title'));
  });

  it('plays from the lobby, pays the time survived and keeps the best', async () => {
    const rig = await lobbyRig(clearedChapterOne());
    await tapWhenUp(rig, 'arena.title');
    await rig.until(() => rig.texts().includes(t('arena.about')));
    expect(rig.store.load().arena).toBe(true);
    expect(rawKeys(rig.texts())).toEqual([]);

    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    expect(rig.shell.run!.engine.state.config).toMatchObject({ arena: true, revives: 0, hard: false });
    const before = rig.store.load();
    await fall(rig, 7, 1500);

    const after = rig.store.load();
    expect(after.arenaBest.waves).toBe(7);
    expect(after.copper - before.copper).toBe(arenaCopper(after.arenaBest.tenths));
    expect(after.runs).toBe(before.runs + 1);
    // no chapter progress from it
    expect(after.best).toEqual(before.best);
    expect(rig.texts()).toContain(t('arena.title'));
    expect(rig.texts()).toContain(t('results.newBest'));
    expect(rawKeys(rig.texts())).toEqual([]);

    // again: straight into another arena run
    await tapWhenUp(rig, 'results.again');
    await rig.until(() => rig.shell.place() === 'run');
    expect(rig.shell.run!.engine.state.config.arena).toBe(true);
    await fall(rig, 3, 400);
    expect(rig.store.load().arenaBest.waves).toBe(7);
    expect(rig.texts()).toContain(t('arena.best', { wave: 7, time: clockTenths(rig.store.load().arenaBest.tenths) }));

    await tapWhenUp(rig, 'common.continue');
    await rig.until(() => rig.shell.place() === 'lobby');
    await rig.until(() => rig.texts().includes(t('arena.about')));
    expect(rig.faults).toEqual([]);
  });

  it('goes back to the chapters from the switch', async () => {
    const rig = await lobbyRig({ ...clearedChapterOne(), arena: true });
    await rig.until(() => rig.texts().includes(t('arena.about')));
    await tapWhenUp(rig, 'lobby.normal');
    await rig.until(() => !rig.texts().includes(t('arena.about')));
    expect(rig.store.load().arena).toBe(false);
  });
});
