import { describe, expect, it } from 'vitest';
import { eventCue } from './soundCues';

describe('eventCue', () => {
  it('plays the local hero\'s own actions and silences another player\'s', () => {
    expect(eventCue({ type: 'kick', owner: 0, dir: 1 }, 0)).toBe('kick');
    expect(eventCue({ type: 'kick', owner: 1, dir: 1 }, 0)).toBeNull();
    expect(eventCue({ type: 'levelUp', owner: 1, level: 3 }, 0)).toBeNull();
    expect(eventCue({ type: 'zen', owner: 0 }, 0)).toBe('zen');
    expect(eventCue({ type: 'zen', owner: 1 }, 0)).toBeNull();
  });

  it('keeps the sandbox\'s harmless hurts quiet', () => {
    expect(eventCue({ type: 'hurt', owner: 0, value: 0 }, 0)).toBeNull();
    expect(eventCue({ type: 'hurt', owner: 0, value: 5 }, 0)).toBe('hurt');
  });

  it('tells crits and ball hits from plain hits', () => {
    const hit = { type: 'hit', kind: 'mob', index: 0, x: 0, y: 0, value: 1, crit: false, ball: false, bx: 0, by: 0 } as const;
    expect(eventCue(hit, 0)).toBe('hit');
    expect(eventCue({ ...hit, ball: true }, 0)).toBe('thump');
    expect(eventCue({ ...hit, ball: true, crit: true }, 0)).toBe('crit');
  });

  it('gives every spell a voice', () => {
    for (const kind of ['nova', 'meteor', 'field', 'chain'] as const) {
      expect(eventCue({ type: 'cast', kind, x: 0, y: 0, radius: 1 }, 0)).not.toBeNull();
    }
  });

  it('plays the world\'s sounds whoever caused them, and mutes another player\'s pickups', () => {
    expect(eventCue({ type: 'mobDown', index: 0, x: 0, y: 0, dx: 0, dy: 0 }, 1)).toBe('pop');
    expect(eventCue({ type: 'bossWindup' }, 1)).toBe('windup');
    expect(eventCue({ type: 'bossDown' }, 1)).toBe('bossDown');
    expect(eventCue({ type: 'emerge', index: 0, x: 0, y: 0 }, 1)).toBe('splash');
    expect(eventCue({ type: 'bossBack' }, 1)).toBe('splash');
    expect(eventCue({ type: 'wave', wave: 2 }, 1)).toBe('wave');
    expect(eventCue({ type: 'cleared' }, 1)).toBe('cleared');
    expect(eventCue({ type: 'pickup', owner: 0, tier: 1 }, 0)).toBe('gem');
    expect(eventCue({ type: 'pickup', owner: 0, tier: 1 }, 1)).toBeNull();
    expect(eventCue({ type: 'dodge', owner: 0 }, 1)).toBeNull();
    expect(eventCue({ type: 'bellUp', owner: 1 }, 1)).toBe('bell');
  });
});
