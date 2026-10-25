import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, ELITE, type EliteKind, type RunConfig } from '../config';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import { newElite } from '../state';
import { damage } from './combat';
import { ringSystem } from './fish';

// A charging elite has super armor (systems/elite.ts superArmor): from the aim to the dash's
// end a hit still hurts it but neither knocks it back nor stuns it; walking, it is pushed as before.

const CHAPTER: RunConfig = { ...DEFAULT_RUN, waves: 50 };

/** A chapter with only the hero (not kicking) and an elite of `kind` 400 to his right. */
function duel(kind: EliteKind = 'charger'): Engine {
  const e = new Engine(CHAPTER);
  const s = e.state;
  s.mobs.length = 0;
  const p = s.players[0];
  s.elites = [newElite(p.x + 400_000, p.y, s.nextId++, ELITE.hp, ELITE.cooldown, kind)];
  p.kickCd = 1e6;
  return e;
}

/** Puts the elite into its dash, running left at the hero. */
function dashing(e: Engine): void {
  const el = e.state.elites[0];
  el.phase = 'dash';
  el.t = 0;
  el.vx = -ELITE.dashSpeed;
  el.vy = 0;
}

function kick(e: Engine): SimEvent[] {
  const events: SimEvent[] = [];
  damage(e.state, events, e.state.mobs.length, e.state.players[0], null);
  return events;
}

describe('charge super armor', () => {
  it('a dashing charger keeps its lane when kicked, and still loses health', () => {
    for (const kind of ['charger', 'wolfLeader'] as const) {
      const e = duel(kind);
      dashing(e);
      const el = e.state.elites[0];
      const [x, y, hp] = [el.x, el.y, el.hp];
      expect(kick(e).some((v) => v.type === 'hit')).toBe(true);
      expect(el.hp).toBeLessThan(hp);
      expect([el.x, el.y]).toEqual([x, y]);
      e.step([]);
      expect(el.phase).toBe('dash');
      expect([el.x, el.y]).toEqual([x - ELITE.dashSpeed, y]);
    }
  });

  it('an aiming charger is not pushed off its marked lane', () => {
    const e = duel();
    const el = e.state.elites[0];
    el.phase = 'aim';
    const x = el.x;
    kick(e);
    expect(el.x).toBe(x);
  });

  it('the same charger walking is knocked back', () => {
    const e = duel();
    const el = e.state.elites[0];
    expect(el.phase).toBe('walk');
    const x = el.x;
    kick(e);
    expect(el.x).toBe(x + ELITE.knockback);
  });

  it('a stunning ring does not freeze a dash, but stuns a walking charger', () => {
    for (const charge of [true, false]) {
      const e = duel();
      if (charge) dashing(e);
      const s = e.state;
      const el = s.elites[0];
      s.rings.push({ id: s.nextId++, owner: 0, x: el.x, y: el.y, radius: 0, reach: 1000, damage: 1, stun: 30, hit: [] });
      ringSystem(s, []);
      expect(el.stun).toBe(charge ? 0 : 30);
    }
  });
});
