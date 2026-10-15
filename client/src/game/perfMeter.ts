import { GPU_CLASSES, PERF_MID_MAX, PERF_MID_SECS, type PerfProps } from '@hk/protocol';
import { LEVELS, SOFTWARE_GPU, WEAK_GPU } from './quality';

// Measures a run's battle frames for the `perf` event (server/src/protocol.ts PerfProps). Frame
// rates go into whole-fps buckets rather than a list of frames, so an hour's run costs the same
// 121 counters as a minute's, and the median and 5th percentile still come out to the frame.

/** Highest fps bucket; faster frames (a 144 Hz screen) count as this. */
const TOP_FPS = 120;
/** A frame this long says nothing about the load (a hidden tab, one hitch): counted long, left out of the rates. */
const PAUSE_MS = 250;
/** A frame at least this long counts as `long`. */
const LONG_MS = 50;
/** Fewer battle seconds than this make no snapshot. */
export const PERF_MIN_SECS = 5;

/** The frame-rate half of PerfProps; the memory half and `nth` come from PerfReport. */
export type PerfSnapshot = Pick<PerfProps, 'why' | 'secs' | 'fps' | 'p5' | 'long' | 'lv0' | 'lvMin' | 'lv' | 'mobs'>;

export class PerfMeter {
  private readonly hist = new Uint32Array(TOP_FPS + 1);
  private frames = 0;
  private long = 0;
  private ms = 0;
  /** Battle ms of the whole run, for the `mid` schedule. */
  private runMs = 0;
  private mids = 0;
  private lv0 = -1;
  private lvMin = 0;
  private lv = 0;
  private mobs = 0;

  /** One battle frame: its length, the quality level it ran on, and the mobs alive. */
  frame(ms: number, level: number, mobs: number): void {
    if (this.lv0 < 0) this.lv0 = this.lvMin = level;
    this.lvMin = Math.min(this.lvMin, level);
    this.lv = level;
    this.mobs = Math.max(this.mobs, mobs);
    if (ms >= LONG_MS) this.long++;
    if (!(ms > 0 && ms < PAUSE_MS)) return;
    this.hist[Math.min(TOP_FPS, Math.round(1000 / ms))]++;
    this.frames++;
    this.ms += ms;
    this.runMs += ms;
  }

  /** Battle seconds measured since the last snapshot. */
  get secs(): number {
    return this.ms / 1000;
  }

  /** A `mid` snapshot is due: every PERF_MID_SECS battle seconds of the run, at most PERF_MID_MAX. */
  midDue(): boolean {
    return this.mids < PERF_MID_MAX && this.runMs >= (this.mids + 1) * PERF_MID_SECS * 1000;
  }

  /**
   * The measure since the last snapshot, then a fresh start for the next (levels and peak mobs
   * run on); null under PERF_MIN_SECS. `keep` leaves the measure running, for a `mid` looked at
   * and not sent: its frames then count in the next snapshot.
   */
  snapshot(why: PerfSnapshot['why'], keep = false): PerfSnapshot | null {
    if (why === 'mid') this.mids++;
    if (this.secs < PERF_MIN_SECS) return null;
    const snap: PerfSnapshot = {
      why, secs: Math.round(this.secs), fps: this.rate(0.5), p5: this.rate(0.05), long: this.long,
      lv0: LEVELS[this.lv0].name, lvMin: LEVELS[this.lvMin].name, lv: LEVELS[this.lv].name, mobs: this.mobs,
    };
    if (!keep) this.reset();
    return snap;
  }

  /** Starts the next snapshot's measure afresh. */
  reset(): void {
    this.hist.fill(0);
    this.frames = this.long = this.ms = 0;
  }

  /** The fps the slowest `share` of frames are at or under. */
  private rate(share: number): number {
    const want = Math.max(1, Math.ceil(this.frames * share));
    let seen = 0;
    for (let fps = 0; fps <= TOP_FPS; fps++) if ((seen += this.hist[fps]) >= want) return fps;
    return TOP_FPS;
  }
}

/** The GPU's coarse class from its WebGL renderer string ('' when the browser hides it). */
export function gpuClass(renderer: string): (typeof GPU_CLASSES)[number] {
  if (!renderer) return 'hidden';
  if (SOFTWARE_GPU.test(renderer)) return 'software';
  return WEAK_GPU.test(renderer) ? 'weak' : 'other';
}
