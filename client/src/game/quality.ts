// Adaptive render quality. A device starts on a level picked from what the host reports
// (desktop or phone, WeChat's model tier, cores, memory, GPU name), then a governor moves it
// with the measured frame rate: down quickly when frames run slow for a few seconds, up
// slowly after a long stable stretch. Neither host exposes the phone's temperature, but a
// hot phone throttles its CPU and GPU and its frames slow down, so frame rate stands in for
// heat. Phones start conservatively and auto never climbs above the start level. A cool phone
// still drains its battery, so auto also drops to saver while the battery runs low.
//
// Levels only change looks, never gameplay: hit tests, damage and mob counts stay the same. Nor
// do they change the battle frame rate: every level, saver too, draws battles at the display's
// rate up to BATTLE_FPS. A 30 fps cap shows every slipped refresh as a 50 ms frame (a visible
// hitch) where at 60 it is 33 ms, so saver saves its power on resolution and effects instead.

export type QualityMode = 'auto' | 'high' | 'saver';
export const QUALITY_MODES: readonly QualityMode[] = ['auto', 'high', 'saver'];

export interface LevelSettings {
  name: string;
  /** Render resolution cap; the device pixel ratio caps it too. */
  resolution: number;
  /** Effect fill budget in screens (1080x1920 world units). */
  fxBudget: number;
  /** Damage numbers on screen at once. */
  numbers: number;
}

// Each step down gives up what is least visible first: optional smoke and sparks, then the
// damage-number density, then resolution.
export const LEVELS: readonly LevelSettings[] = [
  { name: 'saver', resolution: 1.5, fxBudget: 0.3, numbers: 120 },
  { name: 'low', resolution: 1.5, fxBudget: 0.3, numbers: 150 },
  { name: 'mid', resolution: 2, fxBudget: 0.3, numbers: 150 },
  { name: 'phone', resolution: 2, fxBudget: 0.5, numbers: 300 },
  { name: 'high', resolution: 2, fxBudget: 1.5, numbers: 600 },
];
const TOP = LEVELS.length - 1;

/** Battle frame rate cap on every level: a 120 Hz screen draws every other refresh. */
export const BATTLE_FPS = 60;
/** Frame rate cap off the battlefield (lobby, results, pause, level-up cards). Those screens
 *  barely move, so the uneven step a slipped refresh makes at 30 fps cannot be seen there, and
 *  a phone sitting in the lobby spends half the power. */
export const CALM_FPS = 30;

export function targetFps(calm: boolean): number {
  return calm ? CALM_FPS : BATTLE_FPS;
}
const PHONE = 3;

export interface DeviceInfo {
  mobile: boolean;
  /** A tablet (also `mobile`), when the host can tell. */
  tablet?: boolean;
  /** Logical CPU cores and memory in GB, 0 when the host does not say. */
  cores: number;
  memoryGB: number;
  /** WebGL renderer string, '' when hidden. */
  gpu: string;
  /** WeChat's device tier: 1 high, 2 mid, 3 low, 0 unknown. */
  modelLevel: number;
}

export interface LevelRange {
  start: number;
  min: number;
  max: number;
}

/** GPU names that mean a software renderer, and known weak phone GPUs (also the `perf` gpu class). */
export const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render/i;
export const WEAK_GPU = /mali-[t4]|mali-g(31|51|52|57)\b|adreno\D*[2-5]\d\d\b|powervr|sgx/i;

/** Level a device starts on in auto mode. */
export function startLevel(d: DeviceInfo): number {
  if (!d.mobile) return SOFTWARE_GPU.test(d.gpu) ? 2 : TOP;
  if (d.modelLevel === 1) return PHONE;
  const hints = [
    d.modelLevel === 3,
    d.memoryGB > 0 && d.memoryGB <= 3,
    d.cores > 0 && d.cores <= 4,
    WEAK_GPU.test(d.gpu) || SOFTWARE_GPU.test(d.gpu),
  ].filter(Boolean).length;
  return hints === 0 ? PHONE : hints === 1 ? PHONE - 1 : PHONE - 2;
}

export function levelRange(mode: QualityMode, d: DeviceInfo, lowBattery = false): LevelRange {
  if (mode === 'high') return { start: TOP, min: TOP, max: TOP };
  if (mode === 'saver' || lowBattery) return { start: 0, min: 0, max: 0 };
  const start = startLevel(d);
  return { start, min: 0, max: start };
}

/** What a host says about the battery: level 0 to 1. */
export interface Battery {
  level: number;
  charging: boolean;
}

/** Low under this level while not charging; back up only over the second, so a battery at the
 *  edge does not flip the level back and forth. */
const LOW_BATTERY = 0.2;
const BATTERY_OK = 0.3;

export function lowBattery(b: Battery, wasLow: boolean): boolean {
  if (b.charging || !(b.level >= 0)) return false;
  return b.level <= (wasLow ? BATTERY_OK : LOW_BATTERY);
}

/** MSAA is fixed when the GL context is made: desktop auto and forced high get it. */
export function useMsaa(mode: QualityMode, d: DeviceInfo): boolean {
  return mode === 'high' || (mode === 'auto' && !d.mobile);
}

/** A frame passes the gate once this many refreshes short of the cap's interval have gone by. */
const GATE_SLACK = 0.6;
/** Animation-frame gaps the refresh estimate is the median of (odd, so the median is one of them). */
const VSYNC_WINDOW = 31;
/** The estimate is worked out again every this many gaps. */
const VSYNC_EVERY = 4;

/**
 * Frame limiter for a requestAnimationFrame loop, locked to the display: it runs every n-th
 * refresh, n the most whole refreshes that fit in the cap's interval (one on a 60 or 90 Hz
 * screen at 60 fps, two on 120 or 144 Hz), so every frame lasts the same. A fixed schedule
 * would alternate one and two refreshes on 90 or 144 Hz, drift off a 60.1 Hz screen into a
 * skipped refresh every few seconds, and squeeze a short frame in after a late one.
 *
 * The refresh is read from the animation frames themselves: the last VSYNC_WINDOW gaps' time
 * over the refreshes they span, each gap a whole number of their median. iOS stamps a frame
 * when its callback runs, so a late callback is followed by an early one (24 ms then 9 on a
 * 60 Hz screen); the shortest gap would read that as a 110 Hz screen, call every ordinary frame
 * a missed refresh and tighten the gate. This estimate stays on the refresh through that
 * jitter and the odd missed refresh, and follows a screen that really slows down (a phone's
 * battery saver) within about a second. A frame passes
 * once the time since the last one passed is within GATE_SLACK refreshes of the cap's
 * interval, which leaves over half a refresh of room for timestamp jitter either way; after a
 * late frame the count starts again from it.
 */
export class FrameGate {
  /** The display's refresh interval estimate, ms. */
  vsync = 1000 / 60;
  private lastCall = -Infinity;
  private lastPass = -Infinity;
  private readonly recent = new Float64Array(VSYNC_WINDOW);
  private readonly sorted = new Float64Array(VSYNC_WINDOW);
  private seen = 0;

  constructor(public fps: number) {}

  pass(nowMs: number): boolean {
    const gap = nowMs - this.lastCall;
    this.lastCall = nowMs;
    // a gap over 100 ms is a pause or a stall, not a refresh rate
    if (gap > 1 && gap < 100) this.note(gap);
    if (nowMs - this.lastPass < 1000 / this.fps - this.vsync * GATE_SLACK) return false;
    this.lastPass = nowMs;
    return true;
  }

  /** What one frame should last at this cap and refresh: a whole number of refreshes. */
  get frameMs(): number {
    return Math.max(1, Math.ceil(1000 / this.fps / this.vsync - GATE_SLACK)) * this.vsync;
  }

  private note(gap: number): void {
    this.recent[this.seen % VSYNC_WINDOW] = gap;
    this.seen++;
    if (this.seen >= VSYNC_WINDOW && this.seen % VSYNC_EVERY) return;
    // filling up, the gaps so far, so a 120 Hz screen is locked to from its first frames
    const n = Math.min(this.seen, VSYNC_WINDOW);
    const sorted = n === VSYNC_WINDOW ? this.sorted : this.sorted.subarray(0, n);
    sorted.set(n === VSYNC_WINDOW ? this.recent : this.recent.subarray(0, n));
    const median = sorted.sort()[n >> 1];
    // the window's time over the refreshes it spans: a late and an early gap make two
    let ms = 0, refreshes = 0;
    for (let i = 0; i < n; i++) {
      ms += sorted[i];
      refreshes += Math.max(1, Math.round(sorted[i] / median));
    }
    this.vsync = ms / refreshes;
  }
}

export interface GovernorOptions {
  /** Seconds per measuring window. */
  window: number;
  /** Slow windows in a row before stepping down. */
  slowWindows: number;
  /** Stable seconds before trying a level up; doubles when a try fails, up to maxUpAfter. */
  upAfter: number;
  maxUpAfter: number;
  /** A drop this soon (s) after stepping up counts as a failed try. */
  probe: number;
}

export const GOVERNOR: GovernorOptions = { window: 2, slowWindows: 2, upAfter: 30, maxUpAfter: 240, probe: 10 };
/** Under this share of BATTLE_FPS a window is slow; over the second, stable. */
const SLOW = 0.8;
const STABLE = 0.9;

export class FrameGovernor {
  level: number;
  private frames = 0;
  private time = 0;
  private slow = 0;
  private stable = 0;
  private upAfter: number;
  private sinceUp = Infinity;

  constructor(
    private readonly range: LevelRange,
    private readonly opts: GovernorOptions = GOVERNOR,
  ) {
    this.level = range.start;
    this.upAfter = opts.upAfter;
  }

  /** Feeds one frame's length in seconds; true when the level changed. */
  sample(dt: number): boolean {
    // pauses (hidden tab, app in background) and single hitches say nothing about load
    if (!(dt > 0 && dt < 0.25)) return false;
    this.frames++;
    this.time += dt;
    this.sinceUp += dt;
    if (this.time < this.opts.window) return false;
    const fps = this.frames / this.time;
    const span = this.time;
    this.frames = this.time = 0;
    if (fps < BATTLE_FPS * SLOW) {
      this.stable = 0;
      if (++this.slow < this.opts.slowWindows || this.level <= this.range.min) return false;
      if (this.sinceUp < this.opts.probe) this.upAfter = Math.min(this.upAfter * 2, this.opts.maxUpAfter);
      this.slow = 0;
      this.level--;
      return true;
    }
    this.slow = 0;
    this.stable = fps >= BATTLE_FPS * STABLE ? this.stable + span : 0;
    if (this.stable < this.upAfter || this.level >= this.range.max) return false;
    this.stable = 0;
    this.sinceUp = 0;
    this.level++;
    return true;
  }
}
