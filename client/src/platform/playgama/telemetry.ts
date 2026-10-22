import { expPairs, type EventName, type PropValue } from '@hk/protocol';

// What goes to Playgama's own telemetry (get_game_telemetry_guide): a progression funnel made from
// the game's run events, the first run's tutorial funnel, and a `performance_sample` of the battle frames about every 30 active
// seconds. Bridge itself already counts sessions, playtime, ads and purchases, so nothing of
// that is repeated. Pure, so the mapping and the sample's numbers are tested without Bridge.

type Props = Record<string, PropValue>;

/** A chapter and its mode as one bounded step: `chapter_2`, `chapter_2_hard`. */
function step(p: Props): Props {
  const chapter = Number(p.chapter) || 1;
  return { step_id: `chapter_${chapter}${p.hard ? '_hard' : ''}`, step_index: chapter, mode: p.hard ? 'hard' : 'normal' };
}

/** The first run's hint steps in order (ui/tutorial.ts), `done` once the last one is over. */
const TUTORIAL_STEPS = ['move', 'auto', 'gems', 'done'] as const;

/**
 * A first-run `tutorial` event as the step reached and the seconds into the run: `tutorial_step`
 * for each hint as it comes up (`move` as the run starts), `tutorial_completed` once they are all
 * over, so counting each step's users shows the step the first runs end on. Older builds send no
 * step, which means done.
 */
function tutorialEvent(p: Props): [string, Props] {
  const index = TUTORIAL_STEPS.indexOf((p.step ?? 'done') as (typeof TUTORIAL_STEPS)[number]);
  const step_id = TUTORIAL_STEPS[index < 0 ? TUTORIAL_STEPS.length - 1 : index];
  const fields = { step_id, step_index: TUTORIAL_STEPS.indexOf(step_id) + 1, seconds: Number(p.secs) || 0 };
  return [step_id === 'done' ? 'tutorial_completed' : 'tutorial_step', fields];
}

/** The Playgama event for one of the game's own, or null for one Playgama does not get. */
export function progressionEvent(e: EventName, p: Props = {}): [string, Props] | null {
  if (e === 'tutorial') return tutorialEvent(p);
  const build = { monk: String(p.monk ?? ''), relic: String(p.relic ?? '') };
  if (e === 'run_start') return ['progression_started', { ...step(p), ...build }];
  if (e !== 'run_end') return null;
  const result = { ...step(p), ...build, wave: Number(p.wave) || 0, duration_sec: Math.round((Number(p.tenths) || 0) / 10), hero_level: Number(p.level) || 0, kills: Number(p.kills) || 0 };
  if (p.won) return ['progression_completed', result];
  return ['progression_failed', { ...result, reason: p.gaveUp ? 'gave_up' : String(p.cause ?? 'unknown') }];
}

/**
 * The install's experiment arms (an EventBatch's `exp`) as fields on its progression events, so
 * Playgama's funnel splits by them too: `experiment` the ids and `variant` their arms, both
 * comma-joined in the same order (`first20` / `short`); none when the install is in none.
 */
export function armFields(exp: string): Props {
  const pairs = expPairs(exp).map((pair) => pair.split(':'));
  if (pairs.length === 0) return {};
  return { experiment: pairs.map(([id]) => id).join(','), variant: pairs.map(([, arm]) => arm).join(',') };
}

/** The frame rate the game aims for. */
export const TARGET_FPS = 60;
/** Active battle ms in one sample. */
export const SAMPLE_MS = 30_000;
/** A shorter stretch, left over as a run ends or the game goes to the background, is not sent. */
export const SAMPLE_MIN_MS = 5_000;
/** A frame this long is a gap the page did not report (hidden, scrolled out of sight), not a frame. */
export const GAP_MS = 5_000;
const OVER = [50, 100, 250, 500, 1000] as const;

/** The value at fraction `q` of the sorted list (nearest rank). */
function at(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Collects battle frames into `performance_sample` windows. */
export class PerfSampler {
  private frames: number[] = [];
  private active = 0;
  private start = 0;
  private skip = false;

  constructor(
    private readonly build: string,
    /** Wall clock in ms (performance.now in the game). */
    private readonly now: () => number,
  ) {}

  /** One battle frame's length; the full sample once SAMPLE_MS of them are in, else null. */
  frame(ms: number): Props | null {
    if (this.skip) return (this.skip = false), null;
    if (!(ms > 0) || ms >= GAP_MS) return null;
    if (this.frames.length === 0) this.start = this.now() - ms;
    this.frames.push(ms);
    this.active += ms;
    return this.active >= SAMPLE_MS ? this.take() : null;
  }

  /**
   * What is measured so far, if at least SAMPLE_MIN_MS (a run ended, the game was hidden); starts
   * afresh either way, leaving out the next frame, which may span the time the game was away.
   */
  flush(): Props | null {
    this.skip = true;
    return this.active >= SAMPLE_MIN_MS ? this.take() : (this.reset(), null);
  }

  private take(): Props {
    const sorted = [...this.frames].sort((a, b) => a - b);
    const n = sorted.length;
    const props: Props = {
      target_fps: TARGET_FPS,
      window_ms: Math.round(Math.max(this.now() - this.start, this.active)),
      active_ms: Math.round(this.active),
      frame_count: n,
      fps_avg: round1((n * 1000) / this.active),
      fps_p10: round1(1000 / at(sorted, 0.9)),
      frame_time_p50_ms: round1(at(sorted, 0.5)),
      frame_time_p95_ms: round1(at(sorted, 0.95)),
      frame_time_p99_ms: round1(at(sorted, 0.99)),
      frame_time_max_ms: round1(sorted[n - 1]),
      build_version: this.build,
    };
    for (const o of OVER) props[`frames_over_${o}ms`] = countOver(sorted, o);
    this.reset();
    return props;
  }

  private reset(): void {
    this.frames = [];
    this.active = 0;
  }
}

/** Frames of `ms` or longer in a sorted list. */
function countOver(sorted: readonly number[], ms: number): number {
  const i = sorted.findIndex((x) => x >= ms);
  return i < 0 ? 0 : sorted.length - i;
}
