import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN, HERO, ZEN, type RunConfig } from '../config';
import { FISH_LEVELS } from '../content';
import { Engine } from '../Engine';
import type { SimEvent } from '../events';
import type { PlayerCommand } from '../input';
import { newMob } from '../state';
import { inZen, relicPct } from './build';

// Stillness (docs/content.md "Combat roles"): standing still for ZEN.enter puts the hero in Zen,
// relic attacks started then deal ZEN.damage percent, and moving drops it at once.

function cmd(e: Engine, moveMag: number): PlayerCommand {
  return { owner: 0, tick: e.nextTick, moveBrad: 0, moveMag };
}

function steps(e: Engine, n: number, moveMag = 0): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...e.step([cmd(e, moveMag)]));
  return all;
}

const zens = (events: SimEvent[]) => events.filter((v) => v.type === 'zen').length;

/** A chapter with the horde gone and the hero untouchable. */
function quiet(over: Partial<RunConfig> = {}): Engine {
  const e = new Engine({ ...DEFAULT_RUN, waves: 50, ...over });
  e.state.mobs.length = 0;
  e.state.players[0].hurtCd = 1e6;
  return e;
}

describe('stillness', () => {
  it('enters Zen after standing still long enough, and leaves it on the first step', () => {
    const e = quiet();
    const p = e.state.players[0];
    steps(e, ZEN.enter - 1);
    expect(inZen(p)).toBe(false);
    expect(zens(steps(e, 1))).toBe(1);
    expect(inZen(p)).toBe(true);
    expect(zens(steps(e, 100))).toBe(0);
    expect(p.still).toBe(ZEN.enter);
    // a light touch on the stick is not moving
    steps(e, 1, HERO.moveMag);
    expect(inZen(p)).toBe(true);
    steps(e, 1, 255);
    expect(inZen(p)).toBe(false);
    expect(p.still).toBe(0);
    expect(zens(steps(e, ZEN.enter))).toBe(1);
  });

  it('charges the relic attacks started in Zen', () => {
    const e = quiet();
    const p = e.state.players[0];
    expect(relicPct(p, 120)).toBe(120);
    p.still = ZEN.enter;
    expect(relicPct(p, 120)).toBe(Math.trunc((120 * ZEN.damage) / 100));
  });

  it('sends a charged ring from a still wooden fish, a plain one on the move', () => {
    for (const still of [true, false]) {
      const e = quiet({ relic: 'fish' });
      const s = e.state;
      const p = s.players[0];
      steps(e, ZEN.enter, still ? 0 : 255);
      s.mobs.push(newMob(p.x + 150_000, p.y, 1e9));
      steps(e, 10, still ? 0 : 255);
      expect(s.rings.length).toBeGreaterThan(0);
      const base = FISH_LEVELS[0].damage;
      expect(s.rings[0].damage).toBe(still ? relicPct({ ...p, still: ZEN.enter }, base) : base);
    }
  });
});
