import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '@hk/engine';
import { suggestCard } from '@hk/engine/bot/bot';
import type { Container } from 'pixi.js';
import { t } from '../i18n';
import { clockSecs, shownSecond } from './clearTime';
import { liveRun, playUntil, untilOffer, type LiveRun } from '../testkit/liveRun';

/** The width of the hero's health bar's fill (healthBar.ts: 110 at full health). */
function hpFill(run: LiveRun): number {
  return (run.game() as unknown as { healthBar: { fill: Container } }).healthBar.fill.width;
}

describe('the HUD on a live run', { timeout: 30_000 }, () => {
  it('follows the sim: wave, banner, clock, level and health', async () => {
    // chapter 1 is cleared on this save, so its run shows the clock
    const run = await liveRun({ query: '?direct&chapter=1' });
    run.steer('bot');
    const waves = run.sim().config.waves;
    await run.untilSim((s) => s.wave === 1);
    await run.tick(2);
    expect(run.texts()).toContain(t('run.wave', { wave: 1, total: waves }));
    expect(run.texts()).toContain(t('run.waveStart', { wave: 1 }));
    expect(run.texts()).toContain(t('run.level', { level: 1 }));

    // a level-up: the HUD's level follows the pick
    await untilOffer(run);
    run.game().pick(suggestCard(run.sim().players[0]));
    await run.untilSim((s) => s.players[0].offer.length === 0);
    await run.tick(2);
    expect(run.texts()).toContain(t('run.level', { level: run.sim().players[0].level }));
    expect(run.sim().players[0].level).toBe(2);

    // the clock reads the sim's ticks, not the frames
    const from = run.sim().tick;
    await playUntil(run, (s) => s.tick >= from + 6 * TICK_RATE);
    await run.tick(1);
    expect(run.texts()).toContain(clockSecs(shownSecond(run.sim().tick) * 10));
    // the wave-1 banner has had its time
    expect(run.texts()).not.toContain(t('run.waveStart', { wave: 1 }));

    // half the hit points, half the bar
    const p = run.sim().players[0];
    p.hp = Math.floor(p.maxHp / 2);
    await run.tick(1);
    expect(hpFill(run)).toBeCloseTo((110 * p.hp) / p.maxHp, 0);

    // the next wave's number, then its banner
    const next = run.sim().wave + 1;
    await playUntil(run, (s) => s.wave === next);
    await run.tick(2);
    expect(run.texts()).toContain(t('run.wave', { wave: next, total: waves }));
    expect(run.faults).toEqual([]);
  });

  it("keeps the clock off a chapter's first tries", async () => {
    // the save's own chapter 2, never cleared
    const run = await liveRun();
    run.steer('bot');
    await run.untilSim((s) => s.tick >= 3 * TICK_RATE);
    await run.tick(1);
    expect(run.texts()).not.toContain(clockSecs(shownSecond(run.sim().tick) * 10));
  });
});
