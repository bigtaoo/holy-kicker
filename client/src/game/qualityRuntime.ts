import type { Application, Renderer } from 'pixi.js';
import { FrameGate, FrameGovernor, LEVELS, type LevelRange, type LevelSettings } from './quality';

// Drives the frame loop and applies quality levels. Pixi's own ticker.maxFPS cannot be used:
// it still measures each frame's delta from the last skipped animation frame, so a 60 fps cap
// on a 120 Hz screen would run the game at half speed. Instead the ticker is stopped and
// stepped from our own requestAnimationFrame loop behind a FrameGate.

/** The WebGL renderer string, '' when the browser hides it. */
export function gpuName(renderer: Renderer): string {
  const gl = (renderer as Renderer & { gl?: WebGLRenderingContext }).gl;
  if (!gl) return '';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
}

export class QualityRuntime {
  readonly governor: FrameGovernor;
  private readonly gate: FrameGate;
  private readonly maxResolution: number;
  private last = 0;

  constructor(
    private readonly app: Application,
    range: LevelRange,
    /** Applies the parts of a level that live in the game (effect budget, numbers). */
    private readonly onLevel: (s: LevelSettings, level: number) => void,
  ) {
    this.governor = new FrameGovernor(range);
    this.maxResolution = app.renderer.resolution;
    this.gate = new FrameGate(LEVELS[range.start].fps);
    // a later ticker.add() would otherwise start the ticker's own loop again
    app.ticker.autoStart = false;
    app.ticker.stop();
    this.apply();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      if (!this.gate.pass(now)) return;
      if (this.last > 0 && this.governor.sample((now - this.last) / 1000)) this.apply();
      this.last = now;
      app.ticker.update(now);
    };
    requestAnimationFrame(loop);
  }

  get settings(): LevelSettings {
    return LEVELS[this.governor.level];
  }

  private apply(): void {
    const s = this.settings;
    this.gate.fps = s.fps;
    const res = Math.min(this.maxResolution, s.resolution);
    const r = this.app.renderer;
    if (r.resolution !== res) r.resize(this.app.screen.width, this.app.screen.height, res);
    this.onLevel(s, this.governor.level);
  }
}
