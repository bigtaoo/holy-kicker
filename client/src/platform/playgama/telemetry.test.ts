import { describe, expect, it } from 'vitest';
import { armFields, GAP_MS, PerfSampler, progressionEvent, SAMPLE_MS, TARGET_FPS } from './telemetry';

describe('progressionEvent', () => {
  it('maps a run start to a bounded step', () => {
    expect(progressionEvent('run_start', { chapter: 2, hard: true, monk: 'fat', relic: 'staff' })).toEqual([
      'progression_started',
      { step_id: 'chapter_2_hard', step_index: 2, mode: 'hard', monk: 'fat', relic: 'staff' },
    ]);
  });

  it('splits run ends into completed and failed, with the reason', () => {
    const run = { chapter: 1, hard: false, wave: 12, tenths: 1234, level: 9, kills: 300, monk: 'novice', relic: 'fish' };
    const [won, wonProps] = progressionEvent('run_end', { ...run, won: true, gaveUp: false })!;
    expect(won).toBe('progression_completed');
    expect(wonProps).toMatchObject({ step_id: 'chapter_1', wave: 12, duration_sec: 123, hero_level: 9, kills: 300 });
    expect(wonProps.reason).toBeUndefined();
    expect(progressionEvent('run_end', { ...run, won: false, gaveUp: false, cause: 'crowd' })![1].reason).toBe('crowd');
    expect(progressionEvent('run_end', { ...run, won: false, gaveUp: true })).toEqual(['progression_failed', expect.objectContaining({ reason: 'gave_up' })]);
  });

  it('sends each tutorial step with its seconds into the run, and nothing Bridge already counts', () => {
    expect(progressionEvent('tutorial', { step: 'move', secs: 0 })).toEqual(['tutorial_step', { step_id: 'move', step_index: 1, seconds: 0 }]);
    expect(progressionEvent('tutorial', { step: 'gems', secs: 14 })).toEqual(['tutorial_step', { step_id: 'gems', step_index: 3, seconds: 14 }]);
    expect(progressionEvent('tutorial', { step: 'done', secs: 19 })).toEqual(['tutorial_completed', { step_id: 'done', step_index: 4, seconds: 19 }]);
    // an older build's bare event meant done
    expect(progressionEvent('tutorial')).toEqual(['tutorial_completed', { step_id: 'done', step_index: 4, seconds: 0 }]);
    for (const e of ['session', 'ad', 'iap', 'leave', 'perf', 'anomaly', 'buy'] as const) expect(progressionEvent(e, {})).toBeNull();
  });
});

describe('PerfSampler', () => {
  function sampler() {
    let t = 0;
    const s = new PerfSampler('b1', () => t);
    const frame = (ms: number) => ((t += ms), s.frame(ms));
    return { s, frame, wait: (ms: number) => void (t += ms) };
  }

  it('sends one sample per SAMPLE_MS of frames, with the window counts', () => {
    const { frame } = sampler();
    let out = null;
    let n = 0;
    while (!out) out = frame(n++ % 100 === 99 ? 120 : 16);
    expect(out).toMatchObject({ target_fps: TARGET_FPS, frame_count: n, build_version: 'b1', frame_time_p50_ms: 16, frame_time_max_ms: 120 });
    expect(out.active_ms).toBeGreaterThanOrEqual(SAMPLE_MS);
    expect(out.frames_over_50ms).toBe(out.frames_over_100ms);
    expect(out.frames_over_250ms).toBe(0);
    expect(Number(out.fps_avg)).toBeGreaterThan(55);
    expect(Number(out.fps_p10)).toBeCloseTo(62.5, 1);
    // the next window starts empty
    expect(frame(16)).toBeNull();
  });

  it('counts the wall clock of the window, pauses included, but not a gap as a frame', () => {
    const { s, frame, wait } = sampler();
    for (let i = 0; i < 400; i++) frame(20);
    wait(3000);
    expect(frame(GAP_MS)).toBeNull();
    const out = s.flush()!;
    expect(out.active_ms).toBe(8000);
    expect(out.window_ms).toBe(11000 + GAP_MS);
    expect(out.frame_count).toBe(400);
  });

  it('drops a short leftover and the frame after a flush', () => {
    const { s, frame } = sampler();
    for (let i = 0; i < 10; i++) frame(16);
    expect(s.flush()).toBeNull();
    frame(900);
    for (let i = 0; i < 300; i++) frame(20);
    const out = s.flush()!;
    expect(out.frame_count).toBe(300);
    expect(out.frames_over_500ms).toBe(0);
  });
});

describe('armFields', () => {
  it('names the experiments and their arms in the same order, none when not enrolled', () => {
    expect(armFields('first20:short')).toEqual({ experiment: 'first20', variant: 'short' });
    expect(armFields('a:x,first20:control')).toEqual({ experiment: 'a,first20', variant: 'x,control' });
    expect(armFields('')).toEqual({});
    expect(armFields('First20:short')).toEqual({});
  });
});
