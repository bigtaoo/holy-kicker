import { describe, expect, it } from 'vitest';
import { buyMonk, chooseMonk, monkAffordable, monkPrice, ownsMonk } from './monks';
import { newSave, parseSave } from './save';

describe('monks', () => {
  it('starts with the kicker only', () => {
    const save = newSave();
    expect(save.monk).toBe('kicker');
    expect(ownsMonk(save, 'kicker')).toBe(true);
    expect(ownsMonk(save, 'fat')).toBe(false);
    expect(chooseMonk(save, 'fat')).toBe(save);
  });

  it('buys a monk once with jade and plays him', () => {
    const save = { ...newSave(), jade: monkPrice('novice') + 10 };
    expect(monkAffordable(save)).toBe(true);
    const bought = buyMonk(save, 'novice')!;
    expect(bought.jade).toBe(10);
    expect(bought.monk).toBe('novice');
    expect(buyMonk(bought, 'novice')).toBeNull();
    expect(buyMonk(bought, 'fat')).toBeNull();
    expect(monkAffordable(bought)).toBe(false);
    expect(chooseMonk(bought, 'kicker').monk).toBe('kicker');
  });

  it('reads back only owned monks', () => {
    const save = buyMonk({ ...newSave(), jade: 1000 }, 'fat')!;
    const back = parseSave(JSON.stringify(save));
    expect(back.monk).toBe('fat');
    expect(ownsMonk(back, 'fat')).toBe(true);
    expect(parseSave(JSON.stringify({ ...newSave(), monk: 'fat' })).monk).toBe('kicker');
    expect(parseSave(JSON.stringify({ ...newSave(), monks: 0 })).monks).toBe(1);
  });
});
