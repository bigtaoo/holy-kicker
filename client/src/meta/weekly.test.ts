import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '@hk/engine';
import { LATE_MS, type Challenge } from '@hk/protocol';
import { BALANCE } from './balance';
import { challengeSetup } from './challenge';
import { newSave, parseSave, type SaveData } from './save';
import { WEEKS_KEPT, claimWeek, closedWeeks, parseWeeks, settleWeekly, weekClaim, weekOf, weeklyState } from './weekly';

const DAY = 86_400_000;
const START = Date.parse('2026-10-12T00:00:00Z');
const weekly: Challenge = {
  id: 'w2026-42', kind: 'weekly', start: START, end: START + 7 * DAY, seed: 4242, chapter: 2, waves: 50, mutator: null,
  loadout: { relic: 'bowl', monk: 'novice', sutras: ['lotus', 'roar'], chapter: 2 }, engine: ENGINE_VERSION,
};
const BOARD = `w2026-42-e${ENGINE_VERSION}-c2`;
const player = (more: Partial<SaveData> = {}): SaveData => ({ ...newSave(), level: 4, firstRunDone: true, cleared: 1, ...more });

describe('weekly challenge', () => {
  it('opens once chapter 1 is cleared, and asks a client on another engine to update', () => {
    expect(weeklyState(player({ cleared: 0 }), weekly)).toBe('locked');
    expect(weeklyState(player(), weekly)).toBe('open');
    expect(weeklyState(player(), weekly, ENGINE_VERSION + 1)).toBe('update');
  });

  it("plays the record's whole loadout, owned or not, with nothing of the player's", () => {
    const save = player({ relic: 'fish', monk: 'kicker', gear: { ...newSave().gear } });
    expect(challengeSetup(save, weekly)).toEqual({
      chapter: 2, waves: 50, revives: 0, relic: 'bowl', sutras: ['lotus', 'roar'], bonus: {}, hard: false, monk: 'novice', firstRun: false, seed: 4242,
    });
  });

  it('notes the week with its best waves, counting every run', () => {
    const run = (waves: number) => ({ waves, kills: 100 });
    const a = settleWeekly(player(), weekly, BOARD, run(12));
    expect(a.before).toBe(0);
    expect(weekOf(a.save, weekly.id)).toEqual({ id: weekly.id, board: BOARD, end: weekly.end, best: 12 });
    const b = settleWeekly(a.save, weekly, BOARD, run(9));
    expect(b.before).toBe(12);
    expect(weekOf(b.save, weekly.id)?.best).toBe(12);
    expect(b.save.runs).toBe(2);
    expect(b.save.kills).toBe(200);
    expect(b.save.weeks).toHaveLength(1);
    // a long-unpaid week makes room
    let s = player();
    for (let k = 0; k < WEEKS_KEPT + 2; k++) s = settleWeekly(s, { ...weekly, id: `w2026-${10 + k}` }, `w2026-${10 + k}-e1-c2`, run(3)).save;
    expect(s.weeks).toHaveLength(WEEKS_KEPT);
    expect(s.weeks[0].id).toBe(`w2026-${10 + WEEKS_KEPT + 1}`);
  });

  it('pays a week once its ranks are final: taking part, then each tier reached', () => {
    const save = settleWeekly(player(), weekly, BOARD, { waves: 20, kills: 0 }).save;
    expect(closedWeeks(save, weekly.end)).toEqual([]);
    expect(closedWeeks(save, weekly.end + LATE_MS)).toHaveLength(1);
    const week = save.weeks[0];
    const { participation: p, tiers } = BALANCE.challenge.weekly;
    expect(weekClaim(week, 0, 0)).toMatchObject({ tier: 0, jade: p });
    expect(weekClaim(week, 80, 100)).toMatchObject({ tier: 0, jade: p });
    expect(weekClaim(week, 50, 100)).toMatchObject({ tier: 1, jade: p + tiers[0] });
    expect(weekClaim(week, 10, 100)).toMatchObject({ tier: 2, jade: p + tiers[0] + tiers[1] });
    expect(weekClaim(week, 3, 100)).toMatchObject({ tier: 3, jade: p + tiers[0] + tiers[1] + tiers[2] });
    const claim = weekClaim(week, 2, 40);
    const paid = claimWeek(save, claim);
    expect(paid.jade).toBe(save.jade + claim.jade);
    expect(paid.weeks).toEqual([]);
    // twice pays once
    expect(claimWeek(paid, claim)).toBe(paid);
  });

  it('reads back only well-formed weeks', () => {
    const good = { id: 'w2026-42', board: BOARD, end: weekly.end, best: 20 };
    expect(parseWeeks([good, good, { ...good, id: 'd20261018' }, { ...good, id: 'w2026-41' }, { ...good, id: 'w2026-40', board: 'w2026-40-e1-c9x' }, { ...good, id: 'w2026-39', best: 99 }, null])).toEqual([good]);
    expect(parseWeeks('nope')).toEqual([]);
    expect(parseSave(JSON.stringify({ ...newSave(), weeks: [good] })).weeks).toEqual([good]);
  });
});
