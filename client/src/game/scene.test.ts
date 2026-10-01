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
      types: 1, page: 0, mobRes: 1, spells: [], rate: 1, stack: 0, ringFx: 'band', blur: false, fxBudget: 0, quality: 'auto',
      gem: 'pink', drops: 0, threats: false, bullet: 'violet', zone: 'fill', zoneLayer: 'top',
      crit: 'orange', numFade: true, heroBack: true, eliteColor: 'white', foxTint: true,
    });
    expect(parseScene('?spells=nova,lava,chain&rate=3&stack=6&ringfx=quad&blur=1&fxbudget=2')).toMatchObject({
      spells: ['nova', 'chain'], rate: 3, stack: 6, ringFx: 'quad', blur: true, fxBudget: 2,
    });
    expect(parseScene('?types=24&page=2048&mobres=0.6')).toMatchObject({ types: 24, page: 2048, mobRes: 0.6 });
    expect(parseScene('?types=0&page=3000&mobres=2')).toMatchObject({ types: 1, page: 0, mobRes: 1 });
    expect(parseScene('?types=500').types).toBe(64);
    expect(parseScene('?hero=top')).toMatchObject({ heroOnTop: true, heroOverFx: false });
    expect(parseScene('?hero=sort&ring=0&elite=0')).toMatchObject({ heroOnTop: false, ring: false, eliteRing: false });
    expect(parseScene('?mobs=99999').mobs).toBe(2000);
    expect(parseScene('?quality=saver').quality).toBe('saver');
    expect(parseScene('?quality=ultra').quality).toBe('auto');
    expect(parseScene('?gem=lime&drops=5000')).toMatchObject({ gem: 'lime', drops: 5000 });
    expect(parseScene('?threats=1&bullet=ink&zone=edge&zonez=over')).toMatchObject({ threats: true, bullet: 'ink', zone: 'edge', zoneLayer: 'over' });
    expect(parseScene('?crit=red&numfade=0&heroback=0&elitecolor=violet&foxtint=0')).toMatchObject({
      crit: 'red', numFade: false, heroBack: false, eliteColor: 'violet', foxTint: false,
    });
    expect(parseScene('?crit=blue&elitecolor=gold')).toMatchObject({ crit: 'orange', eliteColor: 'white' });
    expect(parseScene('?gem=gold&drops=-1')).toMatchObject({ gem: 'pink', drops: 0 });
  });
});
