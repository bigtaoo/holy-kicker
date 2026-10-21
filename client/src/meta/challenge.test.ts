import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '@hk/engine';
import type { Challenge } from '@hk/protocol';
import { BALANCE } from './balance';
import { challengeBonus, challengeChapter, challengeSetup, challengeState, hoursLeft, milestonePay, settleChallenge } from './challenge';
import { EVOLVE_IDS } from './codex';
import { gearStats } from './gear';
import { chapterMul } from './progress';
import { newSave, type SaveData } from './save';
import { trainingStats } from './training';

const DAY = 86_400_000;
const daily: Challenge = {
  id: 'd20261018', kind: 'daily', start: 20_379 * DAY, end: 20_380 * DAY, seed: 123456, chapter: 'furthest', waves: 50,
  mutator: null, loadout: null, engine: ENGINE_VERSION,
};
const player = (more: Partial<SaveData> = {}): SaveData => ({ ...newSave(), level: 3, firstRunDone: true, cleared: 2, ...more });

describe('daily challenge', () => {
  it('opens at the unlock level once the first run is done, and asks a client on another engine to update', () => {
    expect(challengeState({ ...player(), level: BALANCE.challenge.unlockLevel - 1 }, daily)).toBe('locked');
    expect(challengeState({ ...player(), firstRunDone: false }, daily)).toBe('locked');
    expect(challengeState(player(), daily)).toBe('open');
    expect(challengeState(player(), daily, ENGINE_VERSION + 1)).toBe('update');
    expect(challengeState(player({ challenge: daily.id }), daily)).toBe('done');
    // yesterday's run does not close today's
    expect(challengeState(player({ challenge: 'd20261017' }), daily)).toBe('open');
  });

  it("plays the furthest unlocked chapter on the normal track, or the record's own", () => {
    expect(challengeChapter(player(), daily)).toBe(3);
    expect(challengeChapter(player({ hard: true }), daily)).toBe(3);
    expect(challengeChapter(player({ cleared: BALANCE.chapters }), daily)).toBe(BALANCE.chapters);
    expect(challengeChapter(player(), { ...daily, chapter: 2 })).toBe(2);
  });

  it("sets the run up from the record with the player's loadout, no revives and no hard mode", () => {
    const save = player({ hard: true, relic: 'fish', monk: 'fat' });
    expect(challengeSetup(save, daily)).toMatchObject({
      chapter: 3, waves: 50, revives: 0, relic: 'fish', monk: 'fat', hard: false, firstRun: false, seed: daily.seed, bonus: challengeBonus(save),
    });
    // the record's mutator; one this build does not know plays as none
    expect(challengeSetup(save, { ...daily, mutator: 'glass' }).mutator).toBe('glass');
    expect(challengeSetup(save, { ...daily, mutator: 'newer' }).mutator).toBeNull();
    // the worn gear and the training line, nothing for grit or the novice
    const fresh = newSave();
    expect(challengeBonus(fresh)).toEqual({ ...trainingStats(fresh), ...gearStats(fresh) });
  });

  it("pays the milestones reached on the day's first run, with copper growing by chapter", () => {
    const { save, reward } = settleChallenge(player(), daily, 3, { waves: 12, kills: 400, evolved: [EVOLVE_IDS[0]] });
    const [m5, m10] = BALANCE.challenge.milestones;
    expect(reward.counted).toBe(true);
    expect(reward.reached.map((m) => m.wave)).toEqual([5, 10]);
    expect(reward.copper).toBe(Math.round(m5.copper * chapterMul(3)) + Math.round(m10.copper * chapterMul(3)));
    expect(reward.jade).toBe(m5.jade + m10.jade);
    expect(save.copper).toBe(player().copper + reward.copper);
    expect(save.jade).toBe(player().jade + reward.jade);
    expect(save.challenge).toBe(daily.id);
    expect(save.runs).toBe(player().runs + 1);
    expect(save.kills).toBe(player().kills + 400);
    expect(save.codex).toEqual([EVOLVE_IDS[0]]);
    // waves, chests and experience stay with the chapters
    expect(save.best).toEqual(player().best);
    expect(save.xp).toBe(player().xp);
  });

  it('pays nothing for a run with no milestone or a practice run', () => {
    expect(settleChallenge(player(), daily, 1, { waves: 4, kills: 10 }).reward).toEqual({ counted: true, reached: [], copper: 0, jade: 0 });
    const practice = settleChallenge(player({ challenge: daily.id }), daily, 3, { waves: 50, kills: 900 });
    expect(practice.reward).toEqual({ counted: false, reached: [], copper: 0, jade: 0 });
    expect(practice.save.copper).toBe(player().copper);
    expect(practice.save.runs).toBe(player().runs + 1);
  });

  it('pays every milestone for a full clear', () => {
    const { reward } = settleChallenge(player(), daily, 1, { waves: 50, kills: 0 });
    expect(reward.reached).toEqual(BALANCE.challenge.milestones.map((m) => milestonePay(m, 1)));
  });

  it('counts whole hours left, at least one while the day is open', () => {
    expect(hoursLeft(daily.end, daily.start)).toBe(24);
    expect(hoursLeft(daily.end, daily.end - 90 * 60_000)).toBe(2);
    expect(hoursLeft(daily.end, daily.end - 1000)).toBe(1);
    expect(hoursLeft(daily.end, daily.end)).toBe(0);
  });
});
