import { describe, expect, it, vi } from 'vitest';
import type { Attention } from '../types';
import { bridgeAnalytics } from './bridgeAnalytics';

function rig() {
  const track = vi.fn();
  const seen: Attention = { focus: false, input: false };
  const a = bridgeAnalytics({ track }, 'test', () => {}, { device: 'desktop', form: 'desktop', touch: false }, () => ({ ...seen }));
  return { a, track, seen };
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
});
