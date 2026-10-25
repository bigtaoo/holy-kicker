import { describe, expect, it } from 'vitest';
import { CARD_NUDGE, keyWakes, moveWakes, nudgeOn, tapPose } from './cardNudge';

describe('card nudge', () => {
  it('comes after the wait, unless the player touched anything', () => {
    expect(nudgeOn(CARD_NUDGE.after - 0.1, false)).toBe(false);
    expect(nudgeOn(CARD_NUDGE.after, false)).toBe(true);
    expect(nudgeOn(CARD_NUDGE.after + 10, true)).toBe(false);
  });

  it('counts a pointer only once it moves away, and a key only when it is not a repeat', () => {
    const at = { x: 500, y: 900 };
    expect(moveWakes(null, at)).toBe(false);
    expect(moveWakes(at, at)).toBe(false);
    expect(moveWakes(at, { x: at.x + CARD_NUDGE.slack, y: at.y })).toBe(false);
    expect(moveWakes(at, { x: at.x, y: at.y + CARD_NUDGE.slack + 1 })).toBe(true);
    expect(keyWakes(true)).toBe(false);
    expect(keyWakes(false)).toBe(true);
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
