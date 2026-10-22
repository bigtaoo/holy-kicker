import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, newPlayer, TICK_RATE } from '@hk/engine';
import { buildChanged, buildKey, buildSlots, pairsOf, spellCharges, type Charge } from './buildSlots';

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

  it('shows the staff in the relic slot, awakening with Iron Head', () => {
    const p = newPlayer(0, 0, 0, 100, 0, 'staff');
    p.relic = MAX_LEVEL;
    expect(buildSlots(p)[0]).toMatchObject({ icon: 'staff', needs: 'iron' });
    expect(pairsOf(p, 'iron')).toEqual(['staff']);
    expect(pairsOf(p, 'legs')).toEqual([]);
  });

  it('pairs a spell with its passive and a passive with the owned items it would evolve', () => {
    const p = newPlayer(0, 0, 0);
    expect(pairsOf(p, 'cymbal')).toEqual(['legs']);
    expect(pairsOf(p, 'legs')).toEqual(['ball']);
    p.spells.push({ id: 'cymbal', level: 1, cd: 0, evolved: false });
    expect(pairsOf(p, 'legs')).toEqual(['ball', 'cymbal']);
    expect(pairsOf(p, 'calm')).toEqual([]);
  });

  it('counts down a broken bell and the incense, and sweeps the other spells silently', () => {
    const p = newPlayer(0, 0, 0);
    p.spells.push(
      { id: 'bell', level: 1, cd: 4 * TICK_RATE, evolved: false },
      { id: 'incense', level: 1, cd: TICK_RATE + 1, evolved: true },
      { id: 'bolt', level: 1, cd: 0, evolved: false },
    );
    const [bell, incense, bolt, empty] = spellCharges(p);
    // the bell recharges in 8 s at level 1, the evolved incense every 2.8 s
    expect(bell).toEqual({ share: 0.5, secs: 4 });
    expect(incense!.secs).toBe(2);
    expect(incense!.share).toBeCloseTo((TICK_RATE + 1) / Math.trunc(2.8 * TICK_RATE));
    expect(bolt).toEqual({ share: 0, secs: 0 });
    expect(empty).toBeNull();
    // a raised bell waits for its blow, whatever its counter says
    p.bell = true;
    expect(spellCharges(p)[0]).toEqual({ share: 0, secs: 0 });
  });

  it('leaves out the halo and spells quicker than a second', () => {
    const p = newPlayer(0, 0, 0);
    p.spells.push({ id: 'halo', level: 1, cd: 0, evolved: false }, { id: 'lotus', level: 1, cd: 5, evolved: false });
    expect(spellCharges(p).slice(0, 2)).toEqual([null, null]);
  });

  it('tells a changed build from an unchanged one without building the slots', () => {
    const p = newPlayer(0, 0, 0);
    const seen: unknown[] = [];
    expect(buildChanged(seen, p)).toBe(true);
    expect(buildChanged(seen, p)).toBe(false);
    p.spells.push({ id: 'bolt', level: 1, cd: 0, evolved: false });
    expect(buildChanged(seen, p)).toBe(true);
    p.spells[0].cd = 9;
    expect(buildChanged(seen, p)).toBe(false);
    p.spells[0].level = 2;
    expect(buildChanged(seen, p)).toBe(true);
    p.passives.push({ id: 'iron', level: 1 });
    expect(buildChanged(seen, p)).toBe(true);
    p.spells[0].evolved = true;
    expect(buildChanged(seen, p)).toBe(true);
    p.awakened = true;
    expect(buildChanged(seen, p)).toBe(true);
    expect(buildChanged(seen, p)).toBe(false);
  });

  it('fills the recharges in place, reusing their objects', () => {
    const p = newPlayer(0, 0, 0);
    p.spells.push({ id: 'bell', level: 1, cd: 4 * TICK_RATE, evolved: false });
    const out: (Charge | null)[] = [];
    const first = spellCharges(p, out)[0];
    p.spells[0].cd = 2 * TICK_RATE;
    expect(spellCharges(p, out)).toBe(out);
    expect(out[0]).toBe(first);
    expect(out[0]).toEqual({ share: 0.25, secs: 2 });
    expect(out.slice(1)).toEqual([null, null, null]);
  });
});
