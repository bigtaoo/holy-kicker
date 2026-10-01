// Adaptive render quality. A device starts on a level picked from what the host reports
// (desktop or phone, WeChat's model tier, cores, memory, GPU name), then a governor moves it
// with the measured frame rate: down quickly when frames run slow for a few seconds, up
// slowly after a long stable stretch. Neither host exposes the phone's temperature, but a
// hot phone throttles its CPU and GPU and its frames slow down, so frame rate stands in for
// heat. Phones start conservatively and auto never climbs above the start level.
//
// Levels only change looks, never gameplay: hit tests, damage and mob counts stay the same.

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
  fps: number;
}

// Each step down gives up what is least visible first: optional smoke and sparks, then the
// damage-number density, then resolution, and the frame rate last.
export const LEVELS: readonly LevelSettings[] = [
  { name: 'saver', resolution: 1.5, fxBudget: 0.3, numbers: 120, fps: 30 },
  { name: 'low', resolution: 1.5, fxBudget: 0.3, numbers: 150, fps: 60 },
  { name: 'mid', resolution: 2, fxBudget: 0.3, numbers: 150, fps: 60 },
  { name: 'phone', resolution: 2, fxBudget: 0.5, numbers: 300, fps: 60 },
  { name: 'high', resolution: 2, fxBudget: 1.5, numbers: 600, fps: 60 },
];
const TOP = LEVELS.length - 1;
const PHONE = 3;

export interface DeviceInfo {
  mobile: boolean;
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

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render/i;
const WEAK_GPU = /mali-[t4]|mali-g(31|51|52|57)\b|adreno\D*[2-5]\d\d\b|powervr|sgx/i;

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

export function levelRange(mode: QualityMode, d: DeviceInfo): LevelRange {
  if (mode === 'high') return { start: TOP, min: TOP, max: TOP };
  if (mode === 'saver') return { start: 0, min: 0, max: 0 };
  const start = startLevel(d);
  return { start, min: 0, max: start };
}

/** MSAA is fixed when the GL context is made: desktop auto and forced high get it. */
export function useMsaa(mode: QualityMode, d: DeviceInfo): boolean {
  return mode === 'high' || (mode === 'auto' && !d.mobile);
}

/**
 * Frame limiter for a requestAnimationFrame loop: on a 120 Hz screen a 60 fps cap runs every
 * other frame. Keeps a fixed schedule with a quarter-interval tolerance for timer jitter,
 * and resyncs after a stall instead of bursting to catch up.
 */
export class FrameGate {
  private next = -Infinity;

  constructor(public fps: number) {}

  pass(nowMs: number): boolean {
    const interval = 1000 / this.fps;
    if (nowMs < this.next - interval * 0.25) return false;
    this.next = nowMs - this.next > interval ? nowMs + interval : this.next + interval;
    return true;
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
/** Under this share of the level's frame rate a window is slow; over the second, stable. */
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
    const target = LEVELS[this.level].fps;
    if (fps < target * SLOW) {
      this.stable = 0;
      if (++this.slow < this.opts.slowWindows || this.level <= this.range.min) return false;
      if (this.sinceUp < this.opts.probe) this.upAfter = Math.min(this.upAfter * 2, this.opts.maxUpAfter);
      this.slow = 0;
      this.level--;
      return true;
    }
    this.slow = 0;
    this.stable = fps >= target * STABLE ? this.stable + span : 0;
    if (this.stable < this.upAfter || this.level >= this.range.max) return false;
    this.stable = 0;
    this.sinceUp = 0;
    this.level++;
    return true;
  }
}
