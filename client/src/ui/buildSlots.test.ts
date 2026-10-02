import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, newPlayer } from '@hk/engine';
import { buildKey, buildSlots, pairsOf } from './buildSlots';

describe('build slots', () => {
  it('lists the relic, four spell and four passive slots, empty ones included', () => {
    const p = newPlayer(0, 0, 0);
    p.spells.push({ id: 'bolt', level: 2, cd: 0, evolved: false });
    p.passives.push({ id: 'iron', level: 1 });
    const slots = buildSlots(p);
    expect(slots.length).toBe(9);
    expect(slots.map((s) => s.icon)).toEqual(['ball', 'bolt', null, null, null, 'iron', null, null, null]);
    expect(slots[1]).toMatchObject({ kind: 'spell', level: 2, state: 'normal', needs: null });
    expect(slots[2].state).toBe('empty');
  });

  it('names the missing passive of a maxed spell, then shows it ready, then evolved', () => {
    const p = newPlayer(0, 0, 0);
    p.spells.push({ id: 'palm', level: MAX_LEVEL, cd: 0, evolved: false });
    expect(buildSlots(p)[1]).toMatchObject({ state: 'normal', needs: 'eye' });
    p.passives.push({ id: 'eye', level: 1 });
    const ready = buildSlots(p);
    expect(ready[1]).toMatchObject({ state: 'ready', needs: null });
    p.spells[0].evolved = true;
    expect(buildSlots(p)[1].state).toBe('evolved');
    expect(buildKey(buildSlots(p))).not.toBe(buildKey(ready));
  });

  it('awakens the relic like a spell', () => {
    const p = newPlayer(0, 0, 0);
    p.relic = MAX_LEVEL;
    expect(buildSlots(p)[0].needs).toBe('legs');
    p.awakened = true;
    expect(buildSlots(p)[0].state).toBe('evolved');
  });

  it('pairs a spell with its passive and a passive with the owned items it would evolve', () => {
    const p = newPlayer(0, 0, 0);
    expect(pairsOf(p, 'cymbal')).toEqual(['legs']);
    expect(pairsOf(p, 'legs')).toEqual(['ball']);
    p.spells.push({ id: 'cymbal', level: 1, cd: 0, evolved: false });
    expect(pairsOf(p, 'legs')).toEqual(['ball', 'cymbal']);
    expect(pairsOf(p, 'calm')).toEqual([]);
  });
});
