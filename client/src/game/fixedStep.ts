import { FP, TICK_RATE, type Body } from '@hk/engine';

// The bridge between the screen's frame rate and the sim's fixed 30 Hz: frame time builds up
// in an accumulator, each whole tick of it runs one sim step, and what is left over is how
// far the view interpolates between the last two sim states. Pure, tested without Pixi.

export const TICK_MS = 1000 / TICK_RATE;
/** At most this many steps per frame; past it the backlog is dropped (a hitch, a hidden tab). */
export const MAX_STEPS = 5;

export class FixedStep {
  private acc = 0;

  /** Adds a frame's time; returns how many sim steps to run now. */
  advance(frameMs: number): number {
    this.acc += Math.max(0, frameMs);
    let steps = Math.floor(this.acc / TICK_MS);
    if (steps > MAX_STEPS) {
      steps = MAX_STEPS;
      this.acc = 0;
    } else {
      this.acc -= steps * TICK_MS;
    }
    return steps;
  }

  /** 0 at the last sim state's start, 1 at it: how far to draw between px and x. */
  get alpha(): number {
    return Math.min(1, this.acc / TICK_MS);
  }
}

/** A body's drawn position in world units, `alpha` of the way through the last tick. */
export function lerpX(b: Body, alpha: number): number {
  return (b.px + (b.x - b.px) * alpha) / FP;
}

export function lerpY(b: Body, alpha: number): number {
  return (b.py + (b.y - b.py) * alpha) / FP;
}
