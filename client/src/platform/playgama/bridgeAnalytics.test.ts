import { describe, expect, it, vi } from 'vitest';
import type { Attention } from '../types';
import { bridgeAnalytics } from './bridgeAnalytics';

function rig() {
  const track = vi.fn();
  const seen: Attention = { focus: false, input: false };
  let hide = () => {};
  const a = bridgeAnalytics({ track }, 'test', (cb) => void (hide = cb), { device: 'desktop', form: 'desktop', touch: false }, () => ({ ...seen }));
  return { a, track, seen, hide: () => hide() };
}

describe('bridgeAnalytics', () => {
  it('says on each run and tutorial event whether the game had the focus and the player gave input, as of then', () => {
    const { a, track, seen } = rig();
    a.event('tutorial', { step: 'move', secs: 0 });
    seen.focus = true;
    seen.input = true;
    a.event('tutorial', { step: 'auto', secs: 4 });
    expect(track.mock.calls).toEqual([
      ['tutorial_step', { step_id: 'move', step_index: 1, seconds: 0, device: 'desktop', form: 'desktop', touch: false, focus: false, input: false }],
      ['tutorial_step', { step_id: 'auto', step_index: 2, seconds: 4, device: 'desktop', form: 'desktop', touch: false, focus: true, input: true }],
    ]);
  });

  it('sends nothing once the player turned sharing off, nor events Playgama does not get', () => {
    const { a, track } = rig();
    a.event('alive', { chapter: 1 });
    a.share(false);
    a.event('run_start', { chapter: 1 });
    expect(track).not.toHaveBeenCalled();
  });

  it("puts the run's stutters on its end, counted from its start and not across a hide", () => {
    const { a, track, hide } = rig();
    a.frame(300);
    a.event('run_start', { chapter: 1 });
    for (const ms of [20, 20, 120, 600, 1200, 20]) a.frame(ms);
    hide();
    a.frame(4000);
    a.frame(20);
    a.event('run_end', { chapter: 1, wave: 3, cause: 'mob' });
    const [name, props] = track.mock.calls.at(-1)!;
    expect(name).toBe('progression_failed');
    expect(props).toMatchObject({
      run_frame_count: 7,
      run_fps_avg: 3.5,
      run_frame_max_ms: 1200,
      run_frames_over_100ms: 3,
      run_frames_over_250ms: 2,
      run_frames_over_500ms: 2,
      run_frames_over_1000ms: 1,
    });
    a.event('run_start', { chapter: 1 });
    expect(track.mock.calls.at(-1)![1]).not.toHaveProperty('run_frame_count');
  });
});
