// The first run's tutorial (docs/design.md "Flow": only moving is prompted, everything else is
// automatic). A hint to move stays until the hero has walked for a moment; then a hint that the
// kicks are automatic, standing still charges them (Stillness) and the gems level him up shows for a few seconds. Pure: the shell feeds
// it the frame time and whether the hero moves, the HUD draws the step.

export type TutorialStep = 'move' | 'gems' | 'done';

export interface Tutorial {
  step: TutorialStep;
  /** Seconds walked so far, or seconds the gems hint has shown. */
  t: number;
}

/** Seconds of walking that count as learnt, and how long the second hint stays. */
export const TUTORIAL_MOVE = 1.2;
export const TUTORIAL_GEMS = 7;

export function newTutorial(): Tutorial {
  return { step: 'move', t: 0 };
}

/** Advances by `dt` seconds; `moving` is whether the hero walks this frame. */
export function stepTutorial(tu: Tutorial, dt: number, moving: boolean): Tutorial {
  if (tu.step === 'move') {
    const t = tu.t + (moving ? dt : 0);
    return t >= TUTORIAL_MOVE ? { step: 'gems', t: 0 } : t === tu.t ? tu : { step: 'move', t };
  }
  if (tu.step === 'gems') {
    const t = tu.t + dt;
    return t >= TUTORIAL_GEMS ? { step: 'done', t: 0 } : { step: 'gems', t };
  }
  return tu;
}
