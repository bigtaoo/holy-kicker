import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { loadRun } from '../meta/resume';
import { clearedChapterOne, deviceWith, rigShell, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';


/** A chapter 2 run left at wave 5 when the game went to the background; the next launch's shell. */
async function leftRun(): Promise<ShellRig> {
  const first = await rigShell({ storage: deviceWith(clearedChapterOne()) });
  await first.shell.start();
  await first.until(() => first.shell.place() === 'lobby');
  await tapNamed(first, 'play');
  await first.until(() => first.shell.place() === 'run');
  await first.tick(3);
  first.shell.run!.engine.state.wave = 5;
  first.platform.hide();
  await first.tick(1);
  expect(loadRun(first.platform.storage)?.state.wave).toBe(5);
  const next = await rigShell({ storage: first.platform.storage as never });
  await next.shell.start();
  await next.tick(3);
  return next;
}

describe('a kept run', () => {
  it('is offered on the next launch and goes on where it was left', async () => {
    const rig = await leftRun();
    expect(rig.texts()).toContain(t('run.unfinished'));
    expect(rig.texts()).toContain(t('run.unfinishedAsk'));
    await tapWhenUp(rig, 'common.continue');
    await rig.until(() => rig.shell.place() === 'run');
    const s = rig.shell.run!.engine.state;
    expect(s.config.chapter).toBe(2);
    expect(s.wave).toBe(5);
    expect(rig.faults).toEqual([]);
  });

  it('given up, is settled like a run that fell: results, then the lobby, and nothing kept', async () => {
    const rig = await leftRun();
    const runs = rig.store.load().runs;
    await tapWhenUp(rig, 'run.giveUp');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(30);
    expect(rig.texts()).toContain(t('results.again'));
    expect(rig.store.load().runs).toBe(runs + 1);
    expect(rig.store.load().best[1]).toBe(4);
    expect(loadRun(rig.platform.storage)).toBeNull();
    expect(rig.faults).toEqual([]);
  });
});
