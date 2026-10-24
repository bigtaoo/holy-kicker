import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '@hk/engine';
import { rawKeys } from '../testkit/testShell';
import { liveRun, playUntil, undying } from '../testkit/liveRun';

describe('a full build on a live run', () => {
  it('draws every sutra and the thrown spells, evolved, through a fight', async () => {
    // every sutra, and the spells drawn by arsenalView.ts and sutraView.ts in their evolved form
    const run = await liveRun({ query: '?direct&chapter=3&wave=8&sutras&learn=talisman:6,bomb:6,knives:6,lotus:6,halo:6,roar:6' });
    run.steer('bot');
    undying(run);
    const s0 = run.sim();
    expect(s0.config.sutras.length).toBe(4);
    expect(s0.players[0].spells.filter((sp) => sp.evolved).map((sp) => sp.id).sort()).toEqual(['bomb', 'halo', 'knives', 'lotus', 'roar', 'talisman']);
    const seen = new Set<string>();
    await playUntil(run, (s) => {
      for (const k of ['talismans', 'bombs', 'knives', 'lotuses', 'darts'] as const) if (s[k].length > 0) seen.add(k);
      return s.tick >= 20 * TICK_RATE;
    });
    expect([...seen].sort()).toEqual(['bombs', 'darts', 'knives', 'lotuses', 'talismans']);
    expect(rawKeys(run.texts())).toEqual([]);
    expect(run.faults).toEqual([]);
  });
});
