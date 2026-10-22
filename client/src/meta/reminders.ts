import { ymdOf } from '@hk/protocol';
import { BALANCE } from './balance';
import type { SaveData } from './save';

// The iOS app's local reminders (docs/ios.md "Reminders"): the patrol is full, and today's daily
// challenge is waiting. Pure: from the save, the time and the phone's UTC offset (minutes, as
// Date.getTimezoneOffset gives it) to the reminders to book; ui/reminders.ts books them through
// the host. A reminder never rings in the night (quietFrom..quietTo, local time): a patrol that
// fills then waits for the morning, the daily rings at dailyHour. Offered once, after a few runs,
// never on the first launch.

export interface ReminderBalance {
  /** Runs before the game offers reminders. */
  askAfterRuns: number;
  /** The local hour the daily reminder rings. */
  dailyHour: number;
  /** The daily reminder rings at least this long after the game was last open. */
  gapHours: number;
  /** Local hours no reminder rings in, from quietFrom to quietTo (across midnight). */
  quietFrom: number;
  quietTo: number;
}

export type ReminderId = 'patrol' | 'daily';
export const REMINDER_IDS: readonly ReminderId[] = ['patrol', 'daily'];

export interface Reminder {
  id: ReminderId;
  /** When it rings, ms since 1970. */
  at: number;
}

const R = BALANCE.reminders;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** What to book now; ids left out are cancelled. */
export function reminders(save: SaveData, now: number, offsetMin: number): Reminder[] {
  const out: Reminder[] = [];
  const full = save.patrol > 0 ? save.patrol + BALANCE.patrol.capHours * HOUR : 0;
  if (full > now) out.push({ id: 'patrol', at: awake(full, offsetMin) });
  const daily = dailyAt(save, now, offsetMin);
  if (daily !== null) out.push({ id: 'daily', at: daily });
  return out;
}

/** The first dailyHour, gapHours or more from now, whose daily the player has not played; null before the daily opens. */
export function dailyAt(save: SaveData, now: number, offsetMin: number): number | null {
  if (!save.firstRunDone || save.level < BALANCE.challenge.unlockLevel) return null;
  const shift = offsetMin * 60_000;
  const today = Math.floor((now - shift) / DAY) * DAY;
  for (let k = 0; k < 3; k++) {
    const at = today + k * DAY + R.dailyHour * HOUR + shift;
    if (at >= now + R.gapHours * HOUR && save.challenge !== `d${ymdOf(at)}`) return at;
  }
  return null;
}

/** `at`, or the end of the quiet hours it falls in. */
export function awake(at: number, offsetMin: number): number {
  const shift = offsetMin * 60_000;
  const local = at - shift;
  const day = Math.floor(local / DAY) * DAY;
  const hour = (local - day) / HOUR;
  if (hour >= R.quietFrom) return day + DAY + R.quietTo * HOUR + shift;
  if (hour < R.quietTo) return day + R.quietTo * HOUR + shift;
  return at;
}

/** Whether to offer reminders now: never asked, the system has not answered, and a few runs in. */
export function offerReminders(save: SaveData, status: 'unknown' | 'on' | 'off', asked: boolean): boolean {
  return status === 'unknown' && !asked && save.runs >= R.askAfterRuns;
}
