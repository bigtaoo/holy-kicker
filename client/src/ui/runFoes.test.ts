import { describe, expect, it } from 'vitest';
import type { SimState } from '@hk/engine';
import type { Vec2 } from '../game/dragStick';
import { t } from '../i18n';
import { liveRun, named, playUntil, shown, undying, type LiveRun } from '../testkit/liveRun';

/** The affix badge rows on screen (an elite's over its head, the boss's under its bar). */
function badgesShown(run: LiveRun): number {
  return named(run.app.stage, 'affixes').filter(shown).length;
}

/** A stick pushed at the boss, so it comes into reach of its slam. */
function towardBoss(s: SimState): Vec2 {
  const b = s.boss;
  if (!b) return { x: 0, y: 0 };
  const dx = b.x - s.players[0].x;
  const dy = b.y - s.players[0].y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

describe('elites and bosses on a live run', () => {
  it("wears an act-3 elite's affix badges while it stands, and drops them when it falls", async () => {
    // ?wave=5 opens at the end of wave 4: the elite wave starts on the first tick
    const run = await liveRun({ query: '?direct&chapter=11&wave=5' });
    run.steer('bot');
    undying(run);
    await run.untilSim((s) => s.wave === 5);
    await run.tick(2);
    // wave 5 also opens a shrine: the warning waits out the choice under the cards
    expect(run.texts()).toContain(t('card.shrine'));
    expect(run.texts()).not.toContain(t('run.elite'));
    run.game().pick(0);
    await run.untilSim((s) => s.players[0].offer.length === 0);
    await run.tick(2);
    expect(run.texts()).toContain(t('run.elite'));
    const elites = run.sim().elites;
    expect(elites.length).toBeGreaterThan(0);
    expect(elites.every((e) => e.affixes !== 0)).toBe(true);
    expect(badgesShown(run)).toBe(elites.length);
    // their last hit points: the hero's next blows fell them
    for (const e of elites) {
      e.hp = 1;
      e.guard = 0;
    }
    await playUntil(run, (s) => s.elites.length === 0);
    await run.tick(2);
    expect(badgesShown(run)).toBe(0);
    expect(run.faults).toEqual([]);
  });

  it("shows the boss's bar with its name and affixes on the last wave", async () => {
    const run = await liveRun({ query: '?direct&chapter=11&wave=50' });
    run.steer(towardBoss);
    undying(run);
    await playUntil(run, (s) => s.boss !== null && s.boss.phase !== 'walk');
    await run.tick(2);
    expect(run.texts()).toContain(t('run.boss'));
    expect(run.sim().boss!.affixes).not.toBe(0);
    expect(badgesShown(run)).toBe(1);
  });

  it("names the chapter's boss over its bar, then the kill cam lands on the results with the chapter cleared", async () => {
    const run = await liveRun({ query: '?direct&chapter=1&wave=50' });
    run.steer('bot');
    undying(run);
    expect(run.sim().boss?.kind).toBe('abbot');
    await playUntil(run, (s) => s.wave === 50);
    await run.tick(2);
    expect(run.texts()).toContain(t('run.boss'));
    expect(run.texts()).toContain(t('boss.abbot'));
    expect(badgesShown(run)).toBe(0);
    run.sim().boss!.hp = 1;
    await playUntil(run, (s) => s.outcome === 'won');
    // the boss's fall plays out over the monk's line before the results (808aeb6: it froze here)
    expect(run.shell.place()).toBe('run');
    await run.until(() => run.shell.place() === 'results', 200);
    expect(run.texts()).not.toContain(t('boss.abbot'));
    expect(run.store.load().cleared).toBeGreaterThanOrEqual(1);
    expect(run.faults).toEqual([]);
  });

  it('plays the kill cam when the boss fells the hero, then the results', async () => {
    const run = await liveRun({ query: '?direct&chapter=1&wave=50' });
    const p = run.sim().players[0];
    p.revives = 0;
    p.hp = 1;
    run.steer(towardBoss);
    await playUntil(run, (s) => s.outcome === 'lost');
    await run.tick(2);
    expect(run.game().downCamBusy()).toBe(true);
    expect(run.shell.place()).toBe('run');
    await run.until(() => run.shell.place() === 'results', 200);
    expect(run.faults).toEqual([]);
  });
});
