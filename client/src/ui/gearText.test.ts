import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { newSave } from '../meta/save';
import { dropLines, itemName, mergeReady, TIER_COLORS, tierName } from './gearText';

// The results screen's list of gear found: one line per item and tier, the best first.

describe('dropLines', () => {
  it('names relics and worn gear from their own tables', () => {
    expect(itemName('staff')).toBe(t('relic.staff.name'));
    expect(itemName('robe')).toBe(t('gear.item.robe'));
  });

  it('counts repeats on one line and puts the best tier first', () => {
    const lines = dropLines([
      { item: 'robe', tier: 0 },
      { item: 'staff', tier: 3 },
      { item: 'robe', tier: 0 },
      { item: 'robe', tier: 1 },
      { item: 'robe', tier: 0 },
    ]);
    expect(lines).toEqual([
      [`${tierName(3)} ${itemName('staff')}`, TIER_COLORS[3]],
      [`${tierName(1)} ${itemName('robe')}`, TIER_COLORS[1]],
      [`${tierName(0)} ${itemName('robe')} ${t('gear.count', { n: 3 })}`, TIER_COLORS[0]],
    ]);
  });

  it('leaves the drops it was given in their order', () => {
    const drops = [{ item: 'robe', tier: 0 }, { item: 'sash', tier: 4 }] as const;
    const copy = drops.map((d) => ({ ...d }));
    dropLines(copy);
    expect(copy).toEqual(drops);
    expect(dropLines([])).toEqual([]);
  });
});

describe('mergeReady', () => {
  it('sees a merge on any tier below the top, not only the first four', () => {
    const save = newSave();
    const gear = { ...save.gear, robe: [0, 0, 0, 0, 0, 0, 5, 0] };
    expect(mergeReady({ ...save, copper: 1e9, gear }, 'robe')).toBe(true);
    expect(mergeReady({ ...save, copper: 0, gear }, 'robe')).toBe(false);
    expect(mergeReady({ ...save, copper: 1e9, gear: { ...save.gear, robe: [0, 0, 0, 0, 0, 0, 0, 9] } }, 'robe')).toBe(false);
  });
});
