// What a frame's work cost, for the perf telemetry. QualityRuntime times the whole of
// app.ticker.update; inside it the run adds what its engine steps and its whole frame took.
// The rest of the update is the draw: Pixi's render and the shell's own ticker.

/** ms spent in the current update; zeroed by the frame loop before each one. */
export const frameWork = { sim: 0, run: 0 };

/** One battle frame as the perf telemetry sees it: one object, refilled every frame. */
export interface BattleFrame {
  /** Time since the previous frame, ms. */
  ms: number;
  /** What a frame should last on this display at this cap, ms (FrameGate.frameMs). */
  target: number;
  /** The display's refresh interval, ms (FrameGate.vsync). */
  vsync: number;
  /** The quality level it ran on. */
  level: number;
  /** The work of the frame before, ms, the one whose end this frame's time is counted from: all
   *  of it, then the engine steps, the run's view update, and the rest (Pixi's render). */
  work: number;
  sim: number;
  view: number;
  draw: number;
}
