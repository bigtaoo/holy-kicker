import { describe, expect, it } from 'vitest';
import { cleared, foldDayZero, retag } from './players';
import type { ClientEvent, EventBatch } from './protocol';
import { expPairs, expTag } from './protocol';
import { checkBatch } from './rules';
import { MemoryStore } from './store';

const DAY0 = Date.parse('2026-10-01T10:00:00Z');
const at = (day: number) => DAY0 + day * 86_400_000;

function batch(install: string, events: ClientEvent[], tags: Pick<EventBatch, 'exp' | 'tester'> = {}): EventBatch {
  return { install: `install-${install}`, session: 'session01', host: 'crazygames', build: '1', locale: 'en', events, ...tags };
}

const session: ClientEvent = { e: 'session', t: DAY0 };

describe('the experiment wire', () => {
  it('writes and reads the exp tag', () => {
    expect(expTag({ first20: 'short', b: 'control' })).toBe('b:control,first20:short');
    expect(expTag({ first20: '' })).toBe('');
    expect(expPairs('first20:short')).toEqual(['first20:short']);
    expect(expPairs('First20:short')).toEqual([]);
  });

  it('takes a batch with arms and the tester mark, and an old one without them', () => {
    expect(checkBatch(batch('a', [session], { exp: 'first20:short', tester: true }), DAY0).ok).toBe(true);
    expect(checkBatch(batch('a', [session]), DAY0).ok).toBe(true);
    for (const tags of [{ exp: 'first20' }, { exp: 'a:b,c:d,e:f,g:h,i:j' }, { exp: 7 }, { tester: false }, { tester: 'yes' }]) {
      expect(checkBatch(batch('a', [session], tags as Pick<EventBatch, 'exp'>), DAY0).ok, JSON.stringify(tags)).toBe(false);
    }
  });

  it('checks offers, interstitials and the run length', () => {
    const ok = (e: ClientEvent) => checkBatch(batch('a', [e]), DAY0).ok;
    expect(ok({ e: 'offer', t: DAY0, p: { at: 'lobby_chest', outcome: 'nofill' } })).toBe(true);
    expect(ok({ e: 'offer', t: DAY0, p: { at: 'shop', outcome: 'shown' } })).toBe(false);
    expect(ok({ e: 'offer', t: DAY0, p: { at: 'revive', outcome: 'declined' } })).toBe(false);
    expect(ok({ e: 'ad', t: DAY0, p: { kind: 'inter', at: 'results_next' } })).toBe(true);
    expect(ok({ e: 'ad', t: DAY0, p: { kind: 'inter', at: 'revive' } })).toBe(false);
    expect(ok({ e: 'ad', t: DAY0, p: { at: 'revive' } })).toBe(true);
    expect(ok({ e: 'run_start', t: DAY0, p: { chapter: 1, waves: 20 } })).toBe(true);
    expect(ok({ e: 'run_end', t: DAY0, p: { chapter: 1, waves: 51 } })).toBe(false);
    expect(ok({ e: 'run_end', t: DAY0, p: { chapter: 1, waves: 2.5 } })).toBe(false);
  });
});

describe('the experiment folds', () => {
  it('counts a won run a clear only at full length (or from a build that sent no length)', () => {
    expect(cleared({ won: true })).toBe(true);
    expect(cleared({ won: true, waves: 50 })).toBe(true);
    expect(cleared({ won: true, waves: 20 })).toBe(false);
    expect(cleared({ won: false, waves: 50 })).toBe(false);
    const won = (waves?: number): ClientEvent => ({ e: 'run_end', t: DAY0, p: { chapter: 1, won: true, wave: waves ?? 50, ...(waves && { waves }) } });
    expect(foldDayZero(undefined, [session, won(20)]).wins).toBe(0);
    expect(foldDayZero(undefined, [session, won()]).wins).toBe(1);
  });

  it('counts interstitials, offers without an ad and purchases on day 0', () => {
    const z = foldDayZero(undefined, [
      session,
      { e: 'ad', t: DAY0, p: { kind: 'inter', at: 'results_next' } },
      { e: 'ad', t: DAY0, p: { at: 'revive' } },
      { e: 'offer', t: DAY0, p: { at: 'revive', outcome: 'shown' } },
      { e: 'offer', t: DAY0, p: { at: 'double', outcome: 'nofill' } },
      { e: 'iap', t: DAY0, p: { what: 'buy', outcome: 'owned' } },
      { e: 'iap', t: DAY0, p: { what: 'buy', outcome: 'cancelled' } },
    ]);
    expect(z).toMatchObject({ ads: 1, inters: 1, offers: 1, nofill: 1, iaps: 1 });
  });

  it('keeps the arms and the mark, and leaves them to a batch from an older build', () => {
    expect(retag({}, { exp: 'first20:short' })).toEqual({ exp: ['first20:short'] });
    expect(retag({ exp: ['first20:short'] }, {})).toBeNull();
    expect(retag({ exp: ['first20:short'] }, { exp: 'first20:short' })).toBeNull();
    expect(retag({}, { tester: true })).toEqual({ tester: true });
    expect(retag({ tester: true }, {})).toBeNull();
  });

  it('splits the stats by arm, filters by experiment and leaves testers out', async () => {
    const s = new MemoryStore();
    const start: ClientEvent = { e: 'run_start', t: DAY0 };
    await s.addEvents(batch('a', [session, start, start], { exp: 'first20:control' }), at(0));
    await s.addEvents(batch('b', [session, start], { exp: 'first20:short' }), at(0));
    await s.addEvents(batch('c', [session, start]), at(0));
    await s.addEvents(batch('t', [session, start], { exp: 'first20:short', tester: true }), at(0));
    await s.addEvents(batch('a', [{ ...session, t: at(1) }], { exp: 'first20:control' }), at(1));

    const all = await s.stats(10, at(3), 'crazygames');
    expect(all.cohort).toEqual({ exp: null, testers: false });
    expect(all.cohorts.find((c) => c.day === '2026-10-01')!.fresh).toBe(3);
    expect(all.arms.map((r) => [r.arm, r.n, r.back, r.second])).toEqual([['first20:control', 1, 1, 1], ['first20:short', 1, 0, 0]]);

    const short = await s.stats(10, at(3), 'crazygames', undefined, 'monk', { exp: 'first20:short', testers: true });
    expect(short.cohorts.find((c) => c.day === '2026-10-01')!.fresh).toBe(2);
    const exp = await s.stats(10, at(3), 'crazygames', undefined, 'monk', { exp: 'first20', testers: false });
    expect(exp.cohorts.find((c) => c.day === '2026-10-01')!.fresh).toBe(2);
  });
});
