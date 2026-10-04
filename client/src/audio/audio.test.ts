import { describe, expect, it, vi } from 'vitest';
import { CueGate, coalesceBoost } from './cueGate';
import { CUES } from './cues';
import { VoiceBudget } from './voiceBudget';

const noop = () => {};

describe('CueGate', () => {
  it('merges repeats of a cue in one frame into one play with a count', () => {
    const g = new CueGate();
    for (let i = 0; i < 5; i++) g.add('pop');
    g.add('kick');
    const out = g.flush(1);
    expect(out).toContainEqual({ cue: 'pop', count: 5 });
    expect(out).toContainEqual({ cue: 'kick', count: 1 });
    expect(g.flush(2)).toEqual([]);
  });

  it('drops a cue still inside its gap, and plays it once the gap has passed', () => {
    const g = new CueGate();
    g.add('hurt');
    expect(g.flush(0)).toHaveLength(1);
    g.add('hurt');
    expect(g.flush(CUES.hurt.gap / 2)).toEqual([]);
    g.add('hurt');
    expect(g.flush(CUES.hurt.gap + 0.01)).toHaveLength(1);
  });

  it('releases the highest priority first', () => {
    const g = new CueGate();
    g.add('hit');
    g.add('cleared');
    g.add('kick');
    expect(g.flush(0).map((c) => c.cue)).toEqual(['cleared', 'kick', 'hit']);
  });

  it('forgets pending cues on clear', () => {
    const g = new CueGate();
    g.add('pop');
    g.clear();
    expect(g.flush(0)).toEqual([]);
  });

  it('boosts merged cues on a capped log curve', () => {
    expect(coalesceBoost(1)).toBe(1);
    expect(coalesceBoost(2)).toBeCloseTo(1.15);
    expect(coalesceBoost(1000)).toBe(1.5);
  });
});

describe('VoiceBudget', () => {
  it('grants claims under the cap and frees voices once they end', () => {
    const b = new VoiceBudget(2);
    expect(b.claim(1, 0, 1, noop)).toBe(true);
    expect(b.claim(1, 0, 1, noop)).toBe(true);
    expect(b.claim(1, 0.5, 2, noop)).toBe(false);
    expect(b.claim(1, 1, 2, noop)).toBe(true);
  });

  it('steals the weakest voice for a higher priority, never for an equal one', () => {
    const weak = vi.fn();
    const b = new VoiceBudget(2);
    b.claim(3, 0, 5, noop);
    b.claim(1, 0, 5, weak);
    expect(b.claim(1, 0, 5, noop)).toBe(false);
    expect(weak).not.toHaveBeenCalled();
    expect(b.claim(2, 0, 5, noop)).toBe(true);
    expect(weak).toHaveBeenCalledOnce();
    expect(b.held).toBe(2);
  });

  it('refuses everything with a cap of 0', () => {
    expect(new VoiceBudget(0).claim(9, 0, 1, noop)).toBe(false);
  });
});
