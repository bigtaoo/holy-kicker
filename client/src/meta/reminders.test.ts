import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { awake, dailyAt, offerReminders, reminders } from './reminders';
import { newSave } from './save';

const HOUR = 3600 * 1000;
// 2026-10-22 10:00 UTC; Berlin is UTC+2 then (offset -120), New York UTC-4 (offset 240)
const NOW = Date.UTC(2026, 9, 22, 10);
const BERLIN = -120;
const player = { ...newSave(), firstRunDone: true, level: BALANCE.challenge.unlockLevel, runs: 5 };

describe('reminders', () => {
  it('rings when the patrol fills, and not before the patrol starts or after it is full', () => {
    expect(reminders({ ...newSave(), patrol: 0 }, NOW, 0)).toEqual([]);
    // started at 08:00 UTC: full at 20:00 UTC, 22:00 in Berlin, so it waits for 08:00 there
    const r = reminders({ ...newSave(), patrol: NOW - 2 * HOUR }, NOW, BERLIN);
    expect(r).toEqual([{ id: 'patrol', at: Date.UTC(2026, 9, 23, 6) }]);
    expect(reminders({ ...newSave(), patrol: NOW - 13 * HOUR }, NOW, 0)).toEqual([]);
  });

  it('keeps the night quiet, across midnight on either side', () => {
    expect(awake(Date.UTC(2026, 9, 22, 21), 0)).toBe(Date.UTC(2026, 9, 22, 21));
    expect(awake(Date.UTC(2026, 9, 22, 23), 0)).toBe(Date.UTC(2026, 9, 23, BALANCE.reminders.quietTo));
    expect(awake(Date.UTC(2026, 9, 23, 3), 0)).toBe(Date.UTC(2026, 9, 23, BALANCE.reminders.quietTo));
  });

  it('rings the daily in the evening, skipping a played one and one too close to now', () => {
    expect(dailyAt(newSave(), NOW, 0)).toBeNull();
    const hour = BALANCE.reminders.dailyHour;
    // 10:00 in London: today's at the evening hour
    expect(dailyAt(player, NOW, 0)).toBe(Date.UTC(2026, 9, 22, hour));
    // played today's: tomorrow's
    expect(dailyAt({ ...player, challenge: 'd20261022' }, NOW, 0)).toBe(Date.UTC(2026, 9, 23, hour));
    // open in the late afternoon: too soon, so tomorrow's
    expect(dailyAt(player, Date.UTC(2026, 9, 22, hour - 1), 0)).toBe(Date.UTC(2026, 9, 23, hour));
    // the daily goes by the UTC day: New York's evening still has the one played this morning
    expect(dailyAt({ ...player, challenge: 'd20261022' }, NOW, 240)).toBe(Date.UTC(2026, 9, 23, hour + 4));
    expect(dailyAt(player, NOW, 240)).toBe(Date.UTC(2026, 9, 22, hour + 4));
  });

  it('is offered once, after a few runs, while the system has not been asked', () => {
    const runs = BALANCE.reminders.askAfterRuns;
    expect(offerReminders({ ...player, runs: runs - 1 }, 'unknown', false)).toBe(false);
    expect(offerReminders({ ...player, runs }, 'unknown', false)).toBe(true);
    expect(offerReminders({ ...player, runs }, 'unknown', true)).toBe(false);
    expect(offerReminders({ ...player, runs }, 'off', false)).toBe(false);
  });
});
