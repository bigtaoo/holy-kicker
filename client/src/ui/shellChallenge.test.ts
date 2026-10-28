import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { clearedChapterOne, deviceWith, endRun, rigShell, tapWhenUp, type ShellRig } from '../testkit/testShell';


/** A player past chapter 1 in the lobby, with the challenges made up on the device (?challenge). */
async function lobby(): Promise<ShellRig> {
  const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), query: '?challenge' });
  await rig.shell.start();
  await rig.until(() => rig.shell.place() === 'lobby');
  return rig;
}

/** Plays the open challenge to a fall at `wave`, up to its results. */
async function playTo(rig: ShellRig, wave: number): Promise<void> {
  await tapWhenUp(rig, 'lobby.play');
  await rig.until(() => rig.shell.place() === 'run');
  rig.shell.run!.engine.state.wave = wave;
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results');
  await rig.tick(30);
}

describe('challenge run', () => {
  it('promises no chapter chest: none ahead on the HUD, none earned past its wave', async () => {
    const rig = await lobby();
    await tapWhenUp(rig, 'challenge.tile');
    await tapWhenUp(rig, 'lobby.play');
    await rig.until(() => rig.shell.place() === 'run');
    const chestLines = () => rig.texts().filter((s) => s === t('run.chestEarned') || BALANCE.chests.some((c) => s === t('run.nextChest', { wave: c.wave })));
    await rig.tick(5);
    expect(chestLines()).toEqual([]);
    rig.shell.run!.engine.state.wave = BALANCE.chests[0].wave + 1;
    await rig.tick(5);
    expect(chestLines()).toEqual([]);
    expect(rig.faults).toEqual([]);
  });
});

describe('challenge results', () => {
  it('the daily: its own results, the wave rewards paid, the streak started, back to the lobby', async () => {
    const rig = await lobby();
    const before = rig.store.load();
    await tapWhenUp(rig, 'challenge.tile');
    await playTo(rig, 6);
    const config = rig.shell.run?.engine.state.config;
    expect(config).toBeUndefined(); // the run is over
    const texts = rig.texts();
    expect(texts).toContain(t('challenge.title'));
    expect(texts).toContain(t('results.waves'));
    const save = rig.store.load();
    expect(save.dailyBest.waves).toBe(5);
    expect(save.streak).toBe(1);
    expect(save.copper).toBeGreaterThan(before.copper);
    expect(save.cleared).toBe(1); // a challenge is not the chapter
    await tapWhenUp(rig, 'common.continue');
    await rig.until(() => rig.shell.place() === 'lobby');
    // played today: the panel offers practice now
    await tapWhenUp(rig, 'challenge.tile');
    await rig.until(() => rig.texts().includes(t('challenge.practice')));
    expect(rig.faults).toEqual([]);
  });

  it('the weekly: its tab, its own results, the week recorded', async () => {
    const rig = await lobby();
    await tapWhenUp(rig, 'challenge.tile');
    await tapWhenUp(rig, 'weekly.tab');
    await rig.until(() => rig.texts().includes(t('weekly.loadout')));
    await playTo(rig, 9);
    const texts = rig.texts();
    expect(texts).toContain(t('weekly.title'));
    expect(texts).toContain(t('weekly.newBest'));
    expect(texts).toContain(t('weekly.after'));
    const weeks = rig.store.load().weeks;
    expect(weeks).toHaveLength(1);
    expect(weeks[0].best).toBe(8);
    await tapWhenUp(rig, 'common.continue');
    await rig.until(() => rig.shell.place() === 'lobby');
    expect(rig.faults).toEqual([]);

    // the week closes (?challenge=settle): its reward card comes up in the lobby on the next launch
    const next = await rigShell({ storage: rig.platform.storage as never, query: '?challenge=settle' });
    await next.shell.start();
    await next.until(() => next.shell.place() === 'lobby');
    await next.until(() => next.texts().includes(t('weekly.claimTitle')));
    const jade = next.store.load().jade;
    const paid = Number(next.texts().find((s) => /^\+\d+$/.test(s))!.slice(1));
    expect(paid).toBeGreaterThan(0);
    await tapWhenUp(next, 'weekly.claim');
    await next.until(() => !next.texts().includes(t('weekly.claimTitle')));
    expect(next.store.load().jade).toBe(jade + paid);
    expect(next.store.load().weeks).toEqual([]);
    expect(next.faults).toEqual([]);
  });
});
