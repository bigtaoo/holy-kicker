import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { tapNamed, tapWhenUp } from '../testkit/testShell';
import { liveRun, untilOffer } from '../testkit/liveRun';
import { GIVE_UP_WAIT } from './pausePanel';

describe('pausing a live run', { timeout: 30_000 }, () => {
  it('stops the sim and its clock while the panel is up, and carries on from the same tick on resume', async () => {
    const run = await liveRun();
    run.steer('bot');
    await run.ticks(40);
    await tapNamed(run, 'II');
    await run.tick(2);
    expect(run.texts()).toContain(t('run.paused'));
    expect(run.game().paused).toBe(true);
    const at = run.sim().tick;
    const sent = run.commands().length;
    await run.tick(120);
    expect(run.sim().tick).toBe(at);
    expect(run.commands().length).toBe(sent);
    await tapWhenUp(run, 'run.resume');
    await run.tick(2);
    expect(run.texts()).not.toContain(t('run.paused'));
    await run.ticks(10);
    expect(run.sim().tick).toBeGreaterThanOrEqual(at + 10);
    expect(run.faults).toEqual([]);
  });

  it('takes Escape on a desktop to pause and again to resume', async () => {
    const run = await liveRun({ device: 'desktop' });
    await run.ticks(10);
    run.platform.press('Escape');
    await run.tick(2);
    expect(run.game().paused).toBe(true);
    expect(run.texts()).toContain(t('common.keyEsc'));
    run.platform.press('Escape', true);
    await run.tick(2);
    expect(run.game().paused).toBe(true);
    run.platform.press('Escape');
    await run.tick(2);
    expect(run.game().paused).toBe(false);
    await run.ticks(5);
  });

  it('does not pause over the cards: the keys go to them', async () => {
    const run = await liveRun({ device: 'desktop' });
    run.steer('bot');
    await untilOffer(run);
    run.platform.press('Escape');
    await run.tick(2);
    expect(run.game().paused).toBe(false);
    expect(run.texts()).toContain(t('card.levelUp'));
  });
});

describe('giving up a live run', { timeout: 30_000 }, () => {
  it('asks twice, then settles the run on the results', async () => {
    const run = await liveRun();
    run.steer('bot');
    await run.ticks(60);
    const runs = run.store.load().runs;
    await tapNamed(run, 'II');
    await tapWhenUp(run, 'run.giveUp');
    await run.tick(2);
    // armed, not ended: the panel asks again and the sim still stands
    expect(run.texts()).toContain(t('run.giveUpConfirm'));
    expect(run.shell.place()).toBe('run');
    expect(run.game().paused).toBe(true);
    await tapWhenUp(run, 'run.giveUpConfirm');
    await run.until(() => run.shell.place() === 'results');
    expect(run.store.load().runs).toBe(runs + 1);
    expect(run.faults).toEqual([]);
  });

  it(`lets the first tap lapse after ${GIVE_UP_WAIT} s`, async () => {
    const run = await liveRun();
    await run.ticks(10);
    await tapNamed(run, 'II');
    await tapWhenUp(run, 'run.giveUp');
    await run.tick(2);
    expect(run.texts()).toContain(t('run.giveUpConfirm'));
    await run.tick(Math.ceil(GIVE_UP_WAIT * 60) + 10);
    expect(run.texts()).not.toContain(t('run.giveUpConfirm'));
    expect(run.texts()).toContain(t('run.giveUp'));
    await tapWhenUp(run, 'run.giveUp');
    await run.tick(2);
    expect(run.shell.place()).toBe('run');
  });
});
