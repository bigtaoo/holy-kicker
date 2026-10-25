import type { PropValue } from '@hk/protocol';
import type { Attention, HostAnalytics } from '../types';
import type { PlaygamaBridge } from './bridge';
import { PerfSampler, RunStutter, armFields, progressionEvent } from './telemetry';

// The game's one telemetry adapter for Playgama (telemetry.ts says what goes out): run events as
// a progression funnel and `performance_sample`, both through Bridge's custom events until it has
// system events. Nothing goes once the player turned sharing off; a held answer (the EEA before
// the player says yes) does not stop it, as Bridge's own telemetry runs then too. Every event
// carries the player's device (deviceFields); the run and tutorial events also say whether the
// game ever had the focus (`focus`: the keys could reach it) and the player ever pressed a key or
// touched it (`input`), so a first run left unplayed tells "never got in" from "looked and left";
// a run's end also carries its stutters (RunStutter), to tie them to quits.

/** Chrome's JS heap in MB, or undefined where the browser does not say. */
function heapMB(): number | undefined {
  const used = (globalThis as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance?.memory?.usedJSHeapSize;
  return typeof used === 'number' && used > 0 ? Math.round(used / 2 ** 20) : undefined;
}

export function bridgeAnalytics(bridge: Pick<PlaygamaBridge, 'track'>, build: string, onHide: (cb: () => void) => void, device: Record<string, PropValue>, attention: () => Attention): HostAnalytics {
  let on = true;
  let arms = {};
  const sampler = new PerfSampler(build, () => performance.now());
  const stutter = new RunStutter();
  const sample = (props: ReturnType<PerfSampler['flush']>) => {
    if (!props || !on) return;
    const heap = heapMB();
    props.memory_measurement_supported = heap !== undefined;
    if (heap !== undefined) {
      props.memory_used_mb = heap;
      props.memory_measurement_type = 'js_heap';
    }
    bridge.track('performance_sample', { ...props, ...device });
  };
  // a hidden or paused game ends the window, so the gap is never measured
  onHide(() => {
    sample(sampler.flush());
    stutter.away();
  });
  return {
    share: (yes) => void (on = yes),
    event: (e, p) => {
      if (e === 'run_start') stutter.reset();
      if (e === 'run_end') sample(sampler.flush());
      const mapped = progressionEvent(e, p);
      const ran = e === 'run_end' ? stutter.fields() : {};
      if (mapped && on) bridge.track(mapped[0], { ...mapped[1], ...ran, ...arms, ...device, ...attention() });
    },
    frame: (ms) => {
      stutter.frame(ms);
      sample(sampler.frame(ms));
    },
    tag: (exp) => void (arms = armFields(exp)),
  };
}
