import { describe, expect, it } from 'vitest';
import { BLINK, CorgiFace, FIRE_FACE, HURT_FACE } from './corgiFace';

/** Steps `face` for `seconds` at 60 fps; the faces it showed, in order, without repeats. */
function run(face: CorgiFace, seconds: number): (string | null)[] {
  const seen: (string | null)[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const f = face.step(1 / 60);
    if (seen[seen.length - 1] !== f) seen.push(f);
  }
  return seen;
}

describe('corgi face', () => {
  it('blinks every few seconds and opens the eyes again', () => {
    const face = new CorgiFace(() => 0.9);
    expect(run(face, 2)).toEqual([null]);
    expect(run(face, 4)).toEqual([null, 'head_blink', null]);
  });

  it('sometimes blinks twice in a row', () => {
    const face = new CorgiFace(() => 0);
    expect(run(face, 2.2 + BLINK * 4)).toEqual([null, 'head_blink', null, 'head_blink', null]);
  });

  it('shouts with a shot and winces on a hit, the wince first', () => {
    const face = new CorgiFace(() => 0.9);
    face.fire();
    expect(face.step(0.01)).toBe('head_fire');
    face.hurt();
    expect(face.step(0.01)).toBe('head_hurt');
    expect(face.step(HURT_FACE)).toBe(null);
    face.fire();
    expect(face.step(FIRE_FACE - 0.01)).toBe('head_fire');
    expect(face.step(0.02)).toBe(null);
  });
});
