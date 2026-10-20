import { GPU_CLASSES, PERF_MID_MAX, PERF_MID_SECS, type PerfProps } from '@hk/protocol';
import type { BattleFrame } from './frameWork';
import { LEVELS, SOFTWARE_GPU, WEAK_GPU } from './quality';

// Measures a run's battle frames for the `perf` event (server/src/protocol.ts PerfProps). Frame
// rates go into whole-fps buckets rather than a list of frames, so an hour's run costs the same
// 121 counters as a minute's, and the median and 5th percentile still come out to the frame;
// work times go into quarter-ms buckets the same way. Nothing is allocated per frame.
//
// A hitch is a frame that missed at least one of the display's refreshes it should have shown
// (BattleFrame.target, so 60 and 120 Hz screens compare fairly). A long frame is judged with the
// one after it: iOS stamps a frame when its callback runs, so a callback that runs late (a long
// gap) and the next on time (a short one) add up to whole refreshes and nothing was missed, while
// a refresh really missed leaves the pair a refresh or more over. It is put down to our own work
// when the frame before took WORK_SLOW of a frame's time or more (engine steps, view update and
// Pixi's render), else to something outside it: a garbage collection, the compositor or the GPU
// falling behind, the system.

/** Highest fps bucket; faster frames (a 144 Hz screen) count as this. */
const TOP_FPS = 120;
/** A frame this long says nothing about the load (a hidden tab, one hitch): counted long, left out of the rates. */
const PAUSE_MS = 250;
/** A frame at least this long counts as `long`. */
const LONG_MS = 50;
/** Fewer battle seconds than this make no snapshot. */
export const PERF_MIN_SECS = 5;
/** Share of a frame's time our own work may take before a hitch after it is put down to the work. */
export const WORK_SLOW = 0.75;
/** Work time buckets: WORK_STEP ms each up to WORK_TOP ms (longer counts as the top). */
const WORK_STEP = 0.25;
const WORK_TOP = 100;
const WORK_BUCKETS = WORK_TOP / WORK_STEP + 1;
/** Hitch context bits (PerfReport hitchContext): a boss or elite standing, a wave just begun. */
export const CTX_BOSS = 1;
export const CTX_WAVE = 2;

/** The frame-rate half of PerfProps; the memory half and `nth` come from PerfReport. */
export type PerfSnapshot = Pick<
  PerfProps,
  'why' | 'secs' | 'fps' | 'p5' | 'long' | 'lv0' | 'lvMin' | 'lv' | 'mobs' | 'hz' | 'miss' | 'hitch' | 'hitchWork' | 'hitchBoss' | 'hitchWave' | 'work95' | 'workMax' | 'sim95' | 'view95' | 'draw95'
>;

const tenth = (x: number) => Math.round(x * 10) / 10;

export class PerfMeter {
  private readonly hist = new Uint32Array(TOP_FPS + 1);
  /** Work time histograms: all of a frame's work, the engine steps, the view update, the draw. */
  private readonly work = new Uint32Array(WORK_BUCKETS);
  private readonly sim = new Uint32Array(WORK_BUCKETS);
  private readonly view = new Uint32Array(WORK_BUCKETS);
  private readonly draw = new Uint32Array(WORK_BUCKETS);
  private workMax = 0;
  private frames = 0;
  private long = 0;
  private miss = 0;
  private hitch = 0;
  private hitchWork = 0;
  private hitchBoss = 0;
  private hitchWave = 0;
  private vsync = 0;
  /** A long frame waiting for the next to tell a missed refresh from a late callback; 0 for none. */
  private pendMs = 0;
  private pendTarget = 0;
  private pendWork = false;
  private pendCtx = 0;
  private ms = 0;
  /** Battle ms of the whole run, for the `mid` schedule. */
  private runMs = 0;
  private mids = 0;
  private lv0 = -1;
  private lvMin = 0;
  private lv = 0;
  private mobs = 0;

  /** One battle frame, the mobs alive, and what was going on (CTX_ bits). */
  frame(f: BattleFrame, mobs: number, ctx = 0): void {
    const { ms, level } = f;
    if (this.lv0 < 0) this.lv0 = this.lvMin = level;
    this.lvMin = Math.min(this.lvMin, level);
    this.lv = level;
    this.mobs = Math.max(this.mobs, mobs);
    if (ms >= LONG_MS) this.long++;
    if (!(ms > 0 && ms < PAUSE_MS)) {
      this.settle(0, 0);
      return;
    }
    this.hist[Math.min(TOP_FPS, Math.round(1000 / ms))]++;
    this.frames++;
    this.ms += ms;
    this.runMs += ms;
    this.vsync = f.vsync;
    bucket(this.work, f.work);
    bucket(this.sim, f.sim);
    bucket(this.view, f.view);
    bucket(this.draw, f.draw);
    this.workMax = Math.max(this.workMax, f.work);
    this.settle(ms, f.target);
    if (!(f.target > 0 && ms >= f.target * 1.5)) return;
    this.pendMs = ms;
    this.pendTarget = f.target;
    this.pendWork = f.work >= f.target * WORK_SLOW;
    this.pendCtx = ctx;
  }

  /** Counts the waiting long frame's missed refreshes against the frame after it (`next` ms, 0 for none). */
  private settle(next: number, target: number): void {
    const ms = this.pendMs, t = this.pendTarget;
    if (!ms) return;
    this.pendMs = 0;
    const alone = Math.round(ms / t) - 1;
    // the pair's refreshes over two; a long frame after counts its own when its turn comes
    const missed = next > 0 ? Math.min(alone, Math.round((ms + next) / (target || t)) - 2) : alone;
    if (missed <= 0) return;
    this.miss += missed;
    this.hitch++;
    if (this.pendWork) this.hitchWork++;
    if (this.pendCtx & CTX_BOSS) this.hitchBoss++;
    if (this.pendCtx & CTX_WAVE) this.hitchWave++;
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
    if (!keep) this.settle(0, 0);
    const snap: PerfSnapshot = {
      why, secs: Math.round(this.secs), fps: this.rate(0.5), p5: this.rate(0.05), long: this.long,
      lv0: LEVELS[this.lv0].name, lvMin: LEVELS[this.lvMin].name, lv: LEVELS[this.lv].name, mobs: this.mobs,
      hz: this.vsync > 0 ? Math.round(1000 / this.vsync) : 0, miss: this.miss, hitch: this.hitch, hitchWork: this.hitchWork, hitchBoss: this.hitchBoss, hitchWave: this.hitchWave,
      work95: percentile(this.work, 0.95), workMax: tenth(this.workMax), sim95: percentile(this.sim, 0.95), view95: percentile(this.view, 0.95), draw95: percentile(this.draw, 0.95),
    };
    if (!keep) this.reset();
    return snap;
  }

  /** Starts the next snapshot's measure afresh. */
  reset(): void {
    for (const h of [this.hist, this.work, this.sim, this.view, this.draw]) h.fill(0);
    this.frames = this.long = this.ms = this.workMax = 0;
    this.miss = this.hitch = this.hitchWork = this.hitchBoss = this.hitchWave = this.pendMs = 0;
  }

  /** The fps the slowest `share` of frames are at or under. */
  private rate(share: number): number {
    const want = Math.max(1, Math.ceil(this.frames * share));
    let seen = 0;
    for (let fps = 0; fps <= TOP_FPS; fps++) if ((seen += this.hist[fps]) >= want) return fps;
    return TOP_FPS;
  }
}

/** Counts a work time (ms) in its bucket; a negative one (clock rounding) as zero. */
function bucket(h: Uint32Array, ms: number): void {
  h[Math.max(0, Math.min(WORK_BUCKETS - 1, Math.round(ms / WORK_STEP)))]++;
}

/** The work time (ms) `share` of the counted frames are at or under; 0 for none. */
function percentile(h: Uint32Array, share: number): number {
  let total = 0;
  for (let i = 0; i < h.length; i++) total += h[i];
  if (!total) return 0;
  const want = Math.ceil(total * share);
  let seen = 0;
  for (let i = 0; i < h.length; i++) if ((seen += h[i]) >= want) return tenth(i * WORK_STEP);
  return WORK_TOP;
}

/** The GPU's coarse class from its WebGL renderer string ('' when the browser hides it). */
export function gpuClass(renderer: string): (typeof GPU_CLASSES)[number] {
  if (!renderer) return 'hidden';
  if (SOFTWARE_GPU.test(renderer)) return 'software';
  return WEAK_GPU.test(renderer) ? 'weak' : 'other';
}
