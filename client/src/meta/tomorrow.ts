import { dayKey } from './daily';
import { nextGift } from './welcome';
import type { SaveData } from './save';

// What tomorrow holds, said once today's daily challenge is played (docs/retention.md "Tomorrow"):
// the streak's next day, the welcome gift waiting tomorrow when today's was claimed, and the patrol
// full by then (it fills in BALANCE.patrol.capHours, under a day). One line on the results, so the
// reasons to come back are named at the moment the day's own reasons run out. Pure.

export interface Tomorrow {
  /** The daily streak's day tomorrow's challenge makes. */
  streak: number;
  /** The welcome gift's day waiting tomorrow (1-based), null with none waiting then. */
  gift: number | null;
}

/** Tomorrow's line for a player whose streak stands at `streak` with today's daily played; null before it is played. */
export function tomorrowOf(save: SaveData, now: number, dailyDone: boolean, streak: number): Tomorrow | null {
  if (!dailyDone) return null;
  const gift = save.giftDay === dayKey(now) && nextGift(save) !== null ? save.gifts + 1 : null;
  return { streak: streak + 1, gift };
}
