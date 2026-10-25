import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '@hk/engine';
import { t } from '../i18n';
import { TUTORIAL_AUTO, TUTORIAL_GEMS, TUTORIAL_MOVE } from './tutorial';
import { liveRun, playUntil } from '../testkit/liveRun';
import { NO_PORTAL } from '../platform/types';

describe("the first run's tutorial on a live run", { timeout: 30_000 }, () => {
  it('asks the phone player to move, then teaches the kicks and the gems, then goes', async () => {
    const run = await liveRun({ save: {} });
    await run.ticks(TICK_RATE);
    // standing still, the move hint stays
    expect(run.texts()).toContain(t('tutorial.move'));
    run.steer({ x: 1, y: 0 });
    await playUntil(run, (s) => s.players[0].moving);
    await run.untilSim(() => run.texts().includes(t('tutorial.auto')), Math.ceil((TUTORIAL_MOVE + 1) * TICK_RATE) * 3);
    expect(run.texts()).not.toContain(t('tutorial.move'));
    run.steer('bot');
    await playUntil(run, () => run.texts().includes(t('tutorial.gems')), Math.ceil((TUTORIAL_AUTO + 1) * TICK_RATE) * 3);
    expect(run.texts()).not.toContain(t('tutorial.auto'));
    await playUntil(run, () => !run.texts().includes(t('tutorial.gems')), Math.ceil((TUTORIAL_GEMS + 1) * TICK_RATE) * 3);
    for (const k of ['tutorial.move', 'tutorial.auto', 'tutorial.gems'] as const) expect(run.texts()).not.toContain(t(k));
    expect(run.faults).toEqual([]);
  });

  it('names the keys on a desktop', async () => {
    const run = await liveRun({ save: {}, device: 'desktop' });
    await run.ticks(TICK_RATE);
    expect(run.texts()).toContain(t('tutorial.keys'));
    expect(run.texts()).toContain(t('tutorial.drag'));
    expect(run.texts()).not.toContain(t('tutorial.move'));
  });

  it('holds a desktop first run on the click hint while the keys cannot reach it, and plays once they can', async () => {
    let reach = false;
    const told: string[] = [];
    const portal = { ...NO_PORTAL, gameplayStart: () => told.push('start'), gameplayStop: () => told.push('stop') };
    const run = await liveRun({ save: {}, device: 'desktop', keysReach: () => reach, portal });
    const at = run.sim().tick;
    await run.tick(TICK_RATE);
    expect(run.sim().tick).toBe(at);
    expect(run.texts()).toContain(t('tutorial.click'));
    expect(told).not.toContain('start');
    reach = true;
    await run.ticks(TICK_RATE);
    expect(told).toEqual(['start']);
    expect(run.faults).toEqual([]);
  });

  it("takes the first run's opening level-ups itself and says what it gained", async () => {
    const run = await liveRun({ save: {} });
    run.steer('bot');
    await run.untilSim((s) => s.players[0].level >= 2, 6000);
    await run.tick(2);
    const gained = run.texts().filter((s) => s.startsWith(t('card.gained', { name: '' }).trim()));
    expect(run.sim().players[0].offer).toEqual([]);
    expect(gained.length).toBe(1);
    expect(run.commands().some((c) => c.pick !== undefined && c.pick >= 0)).toBe(true);
  });
});
