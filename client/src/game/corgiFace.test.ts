import { describe, expect, it } from 'vitest';
import { BLINK, CorgiFace, FOCUS, HOLD, HURT_FACE, MOMENT_FACE } from './corgiFace';

/** Steps `face` for `seconds` at 60 fps; the faces it showed, in order, without repeats. */
function run(face: CorgiFace, seconds: number, each?: (t: number) => void): (string | null)[] {
  const seen: (string | null)[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    each?.(t);
    const f = face.step(1 / 60);
    if (seen[seen.length - 1] !== f) seen.push(f);
  }
  return seen;
}

/** A face that never blinks within the test. */
const calm = () => new CorgiFace(() => 1e6);

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

  it('holds the focused face through steady fire, without flicker', () => {
    const face = calm();
    // a shot every 0.4 s for 5 s, then quiet
    const seen = run(face, 5, (t) => {
      if (Math.round(t * 60) % 24 === 0) face.fire();
    });
    expect(seen).toEqual(['head_focus']);
    expect(run(face, FOCUS + 0.1)).toEqual(['head_focus', null]);
  });

  it('blinks through the focused face too', () => {
    const face = new CorgiFace(() => 0.9);
    const seen = run(face, 4, () => face.fire());
    expect(seen).toEqual(['head_focus', 'head_blink', 'head_focus']);
  });

  it('winces on a hit at once, over any face', () => {
    const face = calm();
    face.fire();
    expect(face.step(0.01)).toBe('head_focus');
    face.hurt();
    expect(face.step(0.01)).toBe('head_hurt');
    expect(face.step(HURT_FACE)).toBe('head_focus');
  });

  it('grins on a happy moment and sticks its tongue out on a proud one', () => {
    const face = calm();
    face.cheer('happy');
    expect(run(face, MOMENT_FACE.happy + 0.1)).toEqual(['head_happy', null]);
    face.step(HOLD);
    face.cheer('proud');
    expect(run(face, MOMENT_FACE.proud + 0.1)).toEqual(['head_proud', null]);
  });

  it('does not let a happy moment cut a proud one short', () => {
    const face = calm();
    face.cheer('proud');
    face.step(0.1);
    face.cheer('happy');
    expect(run(face, MOMENT_FACE.proud - 0.2)).toEqual(['head_proud']);
  });

  it('looks worried while health is low, with some slack before it stops', () => {
    const face = calm();
    face.health(0.29);
    expect(face.step(0.01)).toBe('head_worried');
    face.health(0.33);
    expect(face.step(HOLD)).toBe('head_worried');
    face.health(0.4);
    expect(face.step(0.01)).toBe(null);
  });

  it('holds each face a moment before the next one takes over', () => {
    const face = calm();
    face.fire();
    expect(face.step(0.01)).toBe('head_focus');
    face.cheer('proud');
    expect(face.step(HOLD / 2)).toBe('head_focus');
    expect(face.step(HOLD)).toBe('head_proud');
    // the wince does not wait, but what follows it does
    face.hurt();
    expect(face.step(0.01)).toBe('head_hurt');
    expect(face.step(HURT_FACE)).toBe('head_proud');
  });
});
