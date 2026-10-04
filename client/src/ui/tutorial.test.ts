import { describe, expect, it } from 'vitest';
import { newTutorial, stepTutorial, TUTORIAL_GEMS, TUTORIAL_MOVE } from './tutorial';

describe('tutorial', () => {
  it('waits for the hero to walk, then shows the gems hint for a while', () => {
    let tu = newTutorial();
    for (let i = 0; i < 100; i++) tu = stepTutorial(tu, 0.1, false);
    expect(tu.step).toBe('move');
    for (let i = 0; i < Math.ceil(TUTORIAL_MOVE / 0.1) + 1; i++) tu = stepTutorial(tu, 0.1, true);
    expect(tu.step).toBe('gems');
    for (let i = 0; i < Math.ceil(TUTORIAL_GEMS / 0.1) + 1; i++) tu = stepTutorial(tu, 0.1, false);
    expect(tu.step).toBe('done');
    expect(stepTutorial(tu, 1, true)).toBe(tu);
  });

  it('counts only the time spent walking', () => {
    let tu = newTutorial();
    tu = stepTutorial(tu, TUTORIAL_MOVE / 2, true);
    tu = stepTutorial(tu, 10, false);
    expect(tu.step).toBe('move');
    tu = stepTutorial(tu, TUTORIAL_MOVE / 2, true);
    expect(tu.step).toBe('gems');
  });
});
