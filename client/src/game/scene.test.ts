import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE, parseScene } from './scene';

describe('parseScene', () => {
  it('falls back to the defaults', () => {
    expect(parseScene('')).toEqual(DEFAULT_SCENE);
    expect(parseScene('?mobs=abc&ground=lava')).toEqual(DEFAULT_SCENE);
  });

  it('reads every switch', () => {
    expect(parseScene('?mobs=300&ground=grass&hero=top&ring=1&elite=1')).toEqual({
      mobs: 300, ground: 'grass', heroOnTop: true, ring: true, heroOverFx: false, eliteRing: true,
    });
    expect(parseScene('?hero=top')).toMatchObject({ heroOnTop: true, heroOverFx: false });
    expect(parseScene('?hero=sort&ring=0&elite=0')).toMatchObject({ heroOnTop: false, ring: false, eliteRing: false });
    expect(parseScene('?mobs=99999').mobs).toBe(2000);
  });
});
