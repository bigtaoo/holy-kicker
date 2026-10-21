import { describe, expect, it } from 'vitest';
import { CARD_NUDGE, nudgeOn, tapPose } from './cardNudge';

describe('card nudge', () => {
  it('comes after the wait, unless the player touched anything', () => {
    expect(nudgeOn(CARD_NUDGE.after - 0.1, false)).toBe(false);
    expect(nudgeOn(CARD_NUDGE.after, false)).toBe(true);
    expect(nudgeOn(CARD_NUDGE.after + 10, true)).toBe(false);
  });

  it('taps: up, pressed with a ring, up again, every beat', () => {
    expect(tapPose(0)).toEqual({ lift: 1, ripple: -1 });
    const down = tapPose(CARD_NUDGE.beat * 0.35);
    expect(down.lift).toBe(0);
    expect(down.ripple).toBeGreaterThan(0);
    expect(tapPose(CARD_NUDGE.beat * 0.95)).toEqual({ lift: 1, ripple: -1 });
    expect(tapPose(CARD_NUDGE.beat * 1.35).ripple).toBeCloseTo(down.ripple);
  });
});
