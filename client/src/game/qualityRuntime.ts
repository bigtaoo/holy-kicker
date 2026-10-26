import type { Application, Renderer } from 'pixi.js';
import { frameWork, type BattleFrame } from './frameWork';
import { FrameClock } from './frameClock';
import { FrameGate, FrameGovernor, frameResolution, LEVELS, refreshCap, targetFps, type LevelRange, type LevelSettings } from './quality';

// Drives the frame loop and applies quality levels. Pixi's own ticker.maxFPS cannot be used:
// it still measures each frame's delta from the last skipped animation frame, so a 60 fps cap
// on a 120 Hz screen would run the game at half speed. Instead the ticker is stopped and
// stepped from our own requestAnimationFrame loop behind a FrameGate. Calm screens (no run
// stepping) get a lower cap, and their frames are left out of the governor's measure. Each
// update is timed for the perf telemetry (frameWork.ts). The ticker runs on a FrameClock, so
// the sim and the view step whole refreshes however late the frame's callback ran. Screens with
// no run draw at the display's full density and battles at their level's resolution: the canvas
// is resized as the player goes in or out of a run or the display's density changes (browser zoom, a
// window moved to another screen: a canvas kept at the old density is stretched and blurs), and a level moved in a battle has its other
// settings at once and its canvas at the next calm frame (the level-up cards, the pause): a resize
// reallocates the drawing buffer, a frame of 150-400 ms on a CPU-throttled phone in Chrome. A step
// down waits RESIZE_WAIT_MS of battle at most, as the device needs it (and the governor, which
// keeps measuring, takes longer than that to step again); a step up is a try and waits for calm,
// and is often stepped back before then, at no resize at all.

/** The WebGL renderer string, '' when the browser hides it. */
export function gpuName(renderer: Renderer): string {
  const gl = (renderer as Renderer & { gl?: WebGLRenderingContext }).gl;
  if (!gl) return '';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
}

/** Battle ms a step down's lower resolution waits for a calm frame before the canvas is resized anyway. */
export const RESIZE_WAIT_MS = 2000;

export class QualityRuntime {
  governor: FrameGovernor;
  private readonly gate: FrameGate;
  private readonly clock = new FrameClock();
  /** The display's full density now (the density the app was made at where the host has no `density`). */
  private readonly device: () => number;
  private last = 0;
  private wasCalm = true;
  /** Whether the last frame's screen had no run (`sharp`); undefined before the first. */
  private sizedSharp: boolean | undefined;
  /** Battle ms the canvas has waited on a level's new resolution. */
  private waited = 0;
  private readonly frame: BattleFrame = { ms: 0, target: 0, vsync: 0, level: 0, work: 0, sim: 0, view: 0, draw: 0 };
  /** Each battle frame (perf telemetry; the object is reused); calm frames never come here. */
  onBattleFrame: (f: BattleFrame) => void = () => {};
  /** A frame threw (boot.ts hands it to Shell.fault); must not throw itself. */
  onFault: (err: unknown) => void = (err) => console.error(err);
  /** onBattleFrame threw once (logged then, not every frame after). */
  private faulted = false;

  constructor(
    private readonly app: Application,
    range: LevelRange,
    /** Applies the parts of a level that live in the game (effect budget, numbers). */
    private readonly onLevel: (s: LevelSettings, level: number) => void,
    /** True while nothing fast is on screen: no run, or a run that is not stepping. */
    private readonly calm: () => boolean = () => false,
    /** True while no run is on screen (lobby, menus, results): drawn at full density. */
    private readonly sharp: () => boolean = () => false,
    density?: () => number,
  ) {
    this.governor = new FrameGovernor(range);
    const made = app.renderer.resolution;
    this.device = density ?? (() => made);
    this.gate = new FrameGate(targetFps(true));
    // a later ticker.add() would otherwise start the ticker's own loop again
    app.ticker.autoStart = false;
    app.ticker.stop();
    this.apply();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const calm = this.calm();
      this.gate.fps = targetFps(calm, this.governor.level);
      if (!this.gate.pass(now)) return;
      const f = this.frame;
      // calm frames come slower on purpose and say nothing about the load, nor does the first
      // battle frame after them (its time runs from a calm frame)
      if (this.last > 0 && !calm && !this.wasCalm) {
        f.level = this.governor.level;
        if (this.resizeDue()) this.waited += now - this.last;
        if (this.governor.sample((now - this.last) / 1000, refreshCap(this.gate.vsync))) this.apply(calm);
        f.ms = now - this.last;
        f.target = this.gate.frameMs;
        f.vsync = this.gate.vsync;
        // telemetry only watches: a fault in it must never stop the game's frame below
        try {
          this.onBattleFrame(f);
        } catch (err) {
          if (!this.faulted) console.error(err);
          this.faulted = true;
        }
      }
      this.last = now;
      this.wasCalm = calm;
      this.fit(calm);
      frameWork.sim = frameWork.run = 0;
      const start = performance.now();
      // a throw in any of the frame's listeners or the render goes to the shell, which recovers (ui/faultGuard.ts)
      try {
        app.ticker.update(this.clock.tick(now, this.gate.vsync));
      } catch (err) {
        this.onFault(err);
      }
      f.work = performance.now() - start;
      f.sim = frameWork.sim;
      f.view = frameWork.run - frameWork.sim;
      f.draw = f.work - frameWork.run;
    };
    requestAnimationFrame(loop);
  }

  /** A new quality mode from the settings panel. MSAA stays as the context was made with. */
  setRange(range: LevelRange): void {
    this.governor = new FrameGovernor(range);
    this.apply(this.calm());
  }

  get settings(): LevelSettings {
    return LEVELS[this.governor.level];
  }

  private apply(calm = true): void {
    this.fit(calm);
    this.onLevel(this.settings, this.governor.level);
  }

  /** The canvas's resolution differs from what this frame's screen and level ask. */
  private resizeDue(): boolean {
    return this.app.renderer.resolution !== frameResolution(this.sharp(), this.settings, this.device());
  }

  /**
   * Sizes the canvas for this frame's screen; a no-op unless a run came or went or the level
   * moved, and for a level moved in a battle, until a calm frame (or for a step down, RESIZE_WAIT_MS).
   */
  private fit(calm: boolean): void {
    const sharp = this.sharp();
    const res = frameResolution(sharp, this.settings, this.device());
    const r = this.app.renderer;
    const came = sharp !== this.sizedSharp;
    this.sizedSharp = sharp;
    if (r.resolution === res) return void (this.waited = 0);
    if (!calm && !came && (res > r.resolution || this.waited < RESIZE_WAIT_MS)) return;
    this.waited = 0;
    r.resize(this.app.screen.width, this.app.screen.height, res);
  }
}
