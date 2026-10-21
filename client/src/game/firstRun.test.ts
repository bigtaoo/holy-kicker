import { describe, expect, it } from 'vitest';
import { Engine, TICK_RATE } from '@hk/engine';
import { BALANCE } from '../meta/balance';
import { loadout } from '../meta/loadout';
import { newSave } from '../meta/save';
import { autoPick } from '../ui/runWatch';
import { runConfig, runSeed, type RunSetup } from './runSetup';
import { DEFAULT_SCENE } from './scene';

// The first run deals FIRST_RUN_SPELLS first (engine content.ts), then plays a fixed seed
// (BALANCE.firstRun), chosen with the balance bots for the cards
// its opening level-ups take. The deals draw from their own random stream, so they follow from
// the picks alone, wherever the hero walks. If an engine change reshuffles them this test fails:
// run the seed search again (casual and standing-still bots, spell-first opening picks) and pick
// a new seed before updating the expected cards.

/** A fresh player's first run, as the shell sets it up. */
function firstRun(): Engine {
  const save = newSave();
  const setup: RunSetup = {
    chapter: 1, waves: BALANCE.waves, revives: BALANCE.revives, relic: save.relic, sutras: [],
    bonus: loadout(save, 1, false).bonus, monk: save.monk, firstRun: true,
  };
  return new Engine(runConfig(DEFAULT_SCENE, runSeed(DEFAULT_SCENE, setup), setup));
}

describe('the first run', () => {
  it('plays the fixed seed, and a later run a random one', () => {
    const setup: RunSetup = { chapter: 1, waves: 50, revives: 1, relic: 'ball', sutras: [] };
    expect(runSeed(DEFAULT_SCENE, { ...setup, firstRun: true })).toBe(BALANCE.firstRun.seed);
    expect(runSeed(DEFAULT_SCENE, setup, () => 0.5)).not.toBe(BALANCE.firstRun.seed);
    expect(runSeed({ ...DEFAULT_SCENE, seed: 7 }, { ...setup, firstRun: true })).toBe(7);
  });

  it('deals the same opening cards every time, and takes them within the first waves', () => {
    const e = firstRun();
    const s = e.state;
    const taken: string[] = [];
    let wave = 0;
    while (taken.length < BALANCE.firstRun.autoPicks && s.outcome === 'playing' && s.tick < 120 * TICK_RATE) {
      const p = s.players[0];
      const pick = p.offer.length > 0 ? autoPick(p.offer) : undefined;
      if (pick !== undefined) {
        taken.push(`${p.offer[pick].kind}:${p.offer[pick].id}`);
        wave = s.wave;
      }
      e.step([{ owner: 0, tick: s.tick, moveBrad: 0, moveMag: 0, pick }]);
    }
    expect(taken).toEqual(['spell:bomb', 'spell:knives', 'spell:talisman', 'spell:incense', 'spell:talisman']);
    expect(wave).toBeLessThanOrEqual(3);
  });
});
