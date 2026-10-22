import { BALANCE } from '../meta/balance';

// A hand for a player who stares at the level-up cards: once they have stood open
// CARD_NUDGE.after seconds with no tap, pointer move or key, a hand taps the suggested card
// (suggestCard in the engine's bot: the bot's choice without its chance) again and again, and the
// desktop's highlight moves onto that card. Any touch, move or key sends it away for the rest of
// this choice. It only points: the pick stays the player's, so a player away from the screen
// keeps the game paused. Pure: cardPanel.ts draws it (cardHand.ts).

export const CARD_NUDGE = {
  /** Seconds after the cards open before the hand comes. */
  after: BALANCE.cardNudge.after,
  /** Seconds of one tap: down, held, up and a rest. */
  beat: 1.2,
};

/** Whether the hand shows `age` seconds after the cards opened, `touched` if the player did anything since. */
export function nudgeOn(age: number, touched: boolean): boolean {
  return !touched && age >= CARD_NUDGE.after;
}

export interface TapPose {
  /** How far the finger is lifted off the card, 0 (pressed) to 1. */
  lift: number;
  /** The ring spreading from the press, 0 to 1 of its way, or -1 for none. */
  ripple: number;
}

/** The hand's tap `t` seconds into the nudge. */
export function tapPose(t: number): TapPose {
  const k = ((Math.max(0, t) % CARD_NUDGE.beat) + CARD_NUDGE.beat) % CARD_NUDGE.beat / CARD_NUDGE.beat;
  const ease = (x: number) => x * x * (3 - 2 * x);
  const lift = k < 0.3 ? 1 - ease(k / 0.3) : k < 0.42 ? 0 : k < 0.7 ? ease((k - 0.42) / 0.28) : 1;
  const ripple = k >= 0.3 && k < 0.85 ? (k - 0.3) / 0.55 : -1;
  return { lift, ripple };
}
