import { describe, expect, it } from 'vitest';
import { checkBatch, runBuildOk } from './rules';

const NOW = 1_800_000_000_000;
const batch = (p: Record<string, unknown>) => ({ install: 'install-1', session: 'session-1', host: 'web', build: 'b1', locale: 'en', events: [{ e: 'run_end', t: NOW, p }] });

describe('run_end build (RUN_BUILD)', () => {
  it('takes a build and kiting signal of the right shape, and old clients without them', () => {
    expect(runBuildOk({ spells: 'palm5+,bolt3,knives1,talisman5+', passives: 'eye2,rice1,calm5,focus3', relicLv: 5, awakened: true, moving: 87, travel: 41 })).toBe(true);
    expect(runBuildOk({ spells: '', passives: '', relicLv: 1, awakened: false, moving: 0 })).toBe(true);
    expect(runBuildOk({ chapter: 3, wave: 12 })).toBe(true);
    expect(checkBatch(batch({ chapter: 1, spells: 'palm2', moving: 50, travel: 9 }), NOW).ok).toBe(true);
  });

  it('refuses a malformed one, and the batch with it', () => {
    for (const p of [
      { spells: 'palm6' }, { spells: 'palm5,bolt1,bell1,halo1,roar1' }, { spells: 'Palm1' }, { spells: 5 },
      { passives: 'eye1+' }, { relicLv: 0 }, { relicLv: 2.5 }, { awakened: 'yes' },
      { moving: 101 }, { moving: -1 }, { travel: -3 }, { travel: 1e9 },
    ]) {
      expect(runBuildOk(p as unknown as Parameters<typeof runBuildOk>[0]), JSON.stringify(p)).toBe(false);
    }
    expect(checkBatch(batch({ moving: 140 }), NOW).ok).toBe(false);
    // the fields mean nothing on another event, so they are not checked there
    expect(checkBatch({ ...batch({}), events: [{ e: 'leave', t: NOW, p: { moving: 140 } }] }, NOW).ok).toBe(true);
  });
});
