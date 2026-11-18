import { describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { clearedChapterOne, deviceWith, endRun, findTap, rigShell, tap, tapWhenUp, tapNamed, type ShellRig } from '../testkit/testShell';

// The results' reasons for one more run after a fall (ResultsScreen.ts, runFlow.ts): with copper
// for the next training the leading button trains and plays the chapter again in one tap, and with
// today's challenge open a quieter line offers it as a shorter run.

/** A lost run of the lobby's chapter at wave 6, up to its results with the parts all in. */
async function fall(rig: ShellRig): Promise<void> {
  await tapNamed(rig, 'play');
  await rig.until(() => rig.shell.place() === 'run');
  rig.shell.run!.engine.state.wave = 6;
  endRun(rig, 'lost');
  await rig.until(() => rig.shell.place() === 'results' || findTap(rig.app.stage, t('run.giveUp')) !== null);
  if (rig.shell.place() === 'run') tap(findTap(rig.app.stage, t('run.giveUp'))!);
  await rig.until(() => rig.shell.place() === 'results');
  await rig.tick(240);
}

describe('one more run after a fall', { timeout: 30000 }, () => {
  it('with copper for training, leads with Power up & play again: trains, then plays the chapter again', async () => {
    const rig = await rigShell({ storage: deviceWith({ ...clearedChapterOne(), copper: 100000 }) });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await fall(rig);
    const before = rig.store.load();
    const track = vi.spyOn(rig.net, 'track');
    expect(rig.texts()).toContain(t('results.powerAgain'));
    expect(rig.texts()).not.toContain(t('results.again'));
    await tapWhenUp(rig, 'results.powerAgain');
    await rig.until(() => rig.shell.place() === 'run');
    const after = rig.store.load();
    expect(after.trained).toBeGreaterThan(before.trained);
    expect(after.copper).toBeLessThan(before.copper);
    expect(rig.shell.run!.engine.state.config.chapter).toBe(2);
    const buys = track.mock.calls.filter(([name, props]) => name === 'buy' && (props as { from?: string }).from === 'results');
    expect(buys.length).toBe(after.trained - before.trained);
    expect(rig.faults).toEqual([]);
  });

  it("offers today's challenge as a shorter run, and plays it", async () => {
    const rig = await rigShell({ storage: deviceWith(clearedChapterOne()), query: '?challenge' });
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await fall(rig);
    const line = rig.texts().find((s) => s.startsWith(t('results.dailyLine', { n: 0 }).split('0')[0]));
    expect(line).toBeDefined();
    const track = vi.spyOn(rig.net, 'track');
    await tapWhenUp(rig, 'results.dailyGo');
    await rig.until(() => rig.shell.place() === 'run');
    const start = track.mock.calls.find(([name]) => name === 'run_start');
    expect((start?.[1] as { challenge?: string }).challenge).toBeDefined();
    // played, its results name what tomorrow holds
    rig.shell.run!.engine.state.wave = 6;
    endRun(rig, 'lost');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(30);
    const head = t('results.tomorrowLine', { what: '' });
    expect(rig.texts().some((s) => s.startsWith(head) && s.includes(t('results.tomorrowStreak', { n: 2 })))).toBe(true);
    expect(rig.faults).toEqual([]);
  });
});
