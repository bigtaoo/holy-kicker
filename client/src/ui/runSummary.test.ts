import { describe, expect, it } from 'vitest';
import { TICK_RATE, type SimState } from '@hk/engine';
import { clearedWaves, keepable, reachedWave, runSummary } from './runSummary';

/** The few fields these read, on a run of 40 waves. */
function ended(outcome: SimState['outcome'], wave: number, waves = 40): SimState {
  return {
    outcome, wave, tick: 95 * TICK_RATE + 2,
    config: { waves },
    players: [{ level: 12, monk: 'fat', relicId: 'staff' }],
  } as unknown as SimState;
}

describe('runSummary', () => {
  it('keeps only chapter runs in normal play', () => {
    const s = ended('playing', 8);
    expect(keepable(s, { autoplay: false, record: 0 }, false)).toBe(true);
    expect(keepable(ended('playing', 8, 0), { autoplay: false, record: 0 }, false)).toBe(false);
    expect(keepable(s, { autoplay: true, record: 0 }, false)).toBe(false);
    expect(keepable(s, { autoplay: false, record: 30 }, false)).toBe(false);
    expect(keepable(s, { autoplay: false, record: 0 }, true)).toBe(false);
  });

  it('counts the waves cleared: all of a won run, the ones before the fall otherwise', () => {
    expect(clearedWaves(ended('won', 40))).toBe(40);
    expect(clearedWaves(ended('lost', 17))).toBe(16);
    expect(clearedWaves(ended('playing', 1))).toBe(0);
    expect(clearedWaves(ended('lost', 0))).toBe(0);
  });

  it('names a run by the wave it reached, the same number the boards get', () => {
    // fell on wave 14 having cleared 13: the HUD, the record banner, the results and the lobby all say wave 14
    expect(reachedWave(13, 40)).toBe(14);
    expect(reachedWave(clearedWaves(ended('lost', 14)), 40)).toBe(runSummary(ended('lost', 14), 1, false, 0).wave);
    // a clear reached the last wave, not one past it
    expect(reachedWave(40, 40)).toBe(40);
    expect(reachedWave(clearedWaves(ended('won', 40)), 40)).toBe(runSummary(ended('won', 40), 1, false, 0).wave);
    expect(reachedWave(0, 40)).toBe(1);
    // the sandbox has no last wave
    expect(reachedWave(7, 0)).toBe(8);
  });

  it('sums the run up for the backend', () => {
    expect(runSummary(ended('lost', 0), 3, true, 812)).toEqual({
      chapter: 3, hard: true, won: false, wave: 1, tenths: 951, level: 12, kills: 812, monk: 'fat', relic: 'staff',
    });
    expect(runSummary(ended('won', 40), 1, false, 0).won).toBe(true);
  });
});
