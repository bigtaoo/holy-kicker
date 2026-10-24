import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { clearedChapterOne, deviceWith, endRun, rigShell, tapLabel, tapNamed, type ShellRig } from '../testkit/testShell';

/** Taps the results' way back to the lobby, whatever it reads (Collect with a haul waiting, Lobby without). */
function backToLobby(rig: ShellRig): void {
  const texts = rig.texts();
  const collect = texts.find((s) => s.startsWith(t('results.collect', { n: 0 }).split('0')[0]));
  if (collect) tapLabel(rig.app.stage, 'results.collect', { n: Number(/\d+/.exec(collect)![0]) });
  else tapLabel(rig.app.stage, 'results.lobby');
}

describe('the shell, start to lobby', () => {
  it('opens the first run on a fresh save, no lobby before it', async () => {
    const rig = await rigShell();
    await rig.shell.start();
    await rig.tick(3);
    expect(rig.shell.place()).toBe('run');
    expect(rig.shell.run!.engine.state.config.chapter).toBe(1);
    expect(rig.store.load().firstRunDone).toBe(false);
    expect(rig.faults).toEqual([]);
  });

  it('wins the first run: results, then the lobby with the reward kept', async () => {
    const rig = await rigShell();
    await rig.shell.start();
    await rig.tick(3);
    endRun(rig, 'won');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(30);
    expect(rig.texts()).toContain(t('results.nextChapter'));
    backToLobby(rig);
    await rig.until(() => rig.shell.place() === 'lobby');
    const save = rig.store.load();
    expect(save.firstRunDone).toBe(true);
    expect(save.cleared).toBe(1);
    expect(save.runs).toBe(1);
    expect(save.copper).toBeGreaterThan(0);
    expect(rig.faults).toEqual([]);
  });

  it('loses a run: results offer the chapter again, the lobby keeps the copper earned', async () => {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()) });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    const before = rig.store.load();
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    expect(rig.shell.run!.engine.state.config.chapter).toBe(2);
    rig.shell.run!.engine.state.wave = 4;
    endRun(rig, 'lost');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(30);
    expect(rig.texts()).toContain(t('results.again'));
    backToLobby(rig);
    await rig.until(() => rig.shell.place() === 'lobby');
    const after = rig.store.load();
    expect(after.runs).toBe(before.runs + 1);
    expect(after.cleared).toBe(1);
    expect(after.best[1]).toBe(3);
    expect(after.copper).toBeGreaterThan(before.copper);
    expect(rig.faults).toEqual([]);
  });
});
