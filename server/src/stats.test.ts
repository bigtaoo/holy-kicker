import { describe, expect, it } from 'vitest';
import { dayAfter, dayOffset, foldDayZero } from './players';
import type { ClientEvent, EventBatch, Host } from './protocol';
import { boardsOf } from './stats';
import { MemoryStore } from './store';

const DAY0 = Date.parse('2026-10-01T10:00:00Z');
const at = (day: number) => DAY0 + day * 86_400_000;

function batch(install: string, events: ClientEvent[], host: Host = 'crazygames'): EventBatch {
  return { install: `install-${install}`, session: 'session01', host, build: '1', locale: 'en', events };
}

const session: ClientEvent = { e: 'session', t: DAY0 };
const end = (wave: number, won = false): ClientEvent => ({ e: 'run_end', t: DAY0, p: { chapter: 1, hard: false, won, wave, gaveUp: false } });

describe('day 0', () => {
  it('folds the first day into a profile', () => {
    const z = foldDayZero(undefined, [
      session, { e: 'run_start', t: DAY0 }, { e: 'tutorial', t: DAY0 }, end(7), { e: 'run_start', t: DAY0 }, end(12),
      { e: 'buy', t: DAY0, p: { item: 'train' } }, { e: 'leave', t: DAY0, p: { place: 'run', secs: 300, chapter: 1, wave: 4 } },
      { e: 'leave', t: DAY0, p: { place: 'nowhere', secs: 60 } },
    ]);
    expect(z).toMatchObject({ sessions: 1, starts: 2, ends: 2, best: 12, firstWave: 7, tutorial: true, buys: 1, secs: 360, left: 'other', leftWave: 0 });
  });

  it('counts days in whole UTC days', () => {
    expect(dayOffset('2026-09-30', '2026-10-07')).toBe(7);
    expect(dayAfter('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('stats', () => {
  async function store(): Promise<MemoryStore> {
    const s = new MemoryStore();
    // a: plays three runs on day 0, comes back on days 1 and 7; b: one short run, never back;
    // c: opens the game, never plays, comes back on day 1; w: the operator on the web build
    await s.addEvents(batch('a', [session, { e: 'run_start', t: DAY0 }, end(8), { e: 'run_start', t: DAY0 }, end(15), end(50, true)]), at(0));
    await s.addEvents(batch('b', [session, { e: 'run_start', t: DAY0 }, end(3), { e: 'leave', t: DAY0, p: { place: 'results', secs: 90 } }]), at(0));
    await s.addEvents(batch('c', [session]), at(0));
    await s.addEvents(batch('w', [session], 'web'), at(0));
    await s.addEvents(batch('a', [session]), at(1));
    await s.addEvents(batch('a', [session]), at(1));
    await s.addEvents(batch('c', [session]), at(1));
    await s.addEvents(batch('a', [session]), at(7));
    return s;
  }

  it('keeps cohorts per host, with returns not yet over left open', async () => {
    const s = await store();
    const r = await s.stats(10, at(8), 'crazygames');
    expect(r.returnDays).toEqual([1, 3, 7, 14, 30]);
    const day0 = r.cohorts.find((c) => c.day === '2026-10-01')!;
    expect(day0).toEqual({ day: '2026-10-01', fresh: 3, back: [2, 0, 1, null, null] });
    expect(r.days.find((d) => d.day === '2026-10-02')).toMatchObject({ active: 2, fresh: 0 });
    expect(r.days.find((d) => d.day === '2026-10-01')).toMatchObject({ active: 3, fresh: 3, runs: 3, ended: 4 });
    // on day 7 itself, D7 is still to come
    expect((await s.stats(10, at(7), 'crazygames')).cohorts.find((c) => c.day === '2026-10-01')!.back).toEqual([2, 0, null, null, null]);
    expect((await s.stats(10, at(8), null)).cohorts.find((c) => c.day === '2026-10-01')!.fresh).toBe(4);
    expect((await s.stats(10, at(8), 'web')).cohorts.find((c) => c.day === '2026-10-01')!.back[0]).toBe(0);
  });

  it('says what day 0 looked like for who came back', async () => {
    const r = await (await store()).stats(10, at(8), 'crazygames');
    const funnel = Object.fromEntries(r.funnel.map((f) => [f.step, f.n]));
    expect(funnel).toMatchObject({ 'opened the game': 3, 'started a run': 2, 'finished a run': 2, 'reached wave 10': 1, 'cleared a chapter': 1, 'finished 3+ runs': 1 });
    const runs = r.drivers.find((d) => d.name === 'runs finished on day 0')!.groups;
    expect(runs).toEqual(expect.arrayContaining([{ label: '0', n: 1, back: 1 }, { label: '1', n: 1, back: 0 }, { label: '2-3', n: 1, back: 1 }]));
    expect(r.drivers.find((d) => d.name === 'last left the game from')!.groups).toEqual(
      expect.arrayContaining([{ label: 'results', n: 1, back: 0 }, { label: 'unknown', n: 2, back: 2 }]),
    );
    expect(r.drivers.find((d) => d.name === 'first build played')!.groups).toEqual([{ label: '1', n: 3, back: 2 }]);
    expect(r.firstRun).toEqual([{ wave: 3, n: 1, back: 0 }, { wave: 8, n: 1, back: 1 }]);
    expect(r.boards).toEqual([{ board: 'c1', runs: 4, won: 1, medianLostWave: 8 }]);
  });

  it('leaves installs whose next day is not over out of the drivers', async () => {
    const s = new MemoryStore();
    await s.addEvents(batch('n', [session]), at(0));
    const r = await s.stats(3, at(1), null);
    expect(r.funnel[0].n).toBe(1);
    expect(r.drivers.every((d) => d.groups.length === 0)).toBe(true);
  });

  it('takes the median lost wave from counted outcomes', () => {
    const rows = boardsOf([
      { chapter: 2, hard: true, won: false, wave: 10, n: 3 },
      { chapter: 2, hard: true, won: false, wave: 30, n: 1 },
      { chapter: 2, hard: true, won: true, wave: 50, n: 2 },
    ]);
    expect(rows).toEqual([{ board: 'c2h', runs: 6, won: 2, medianLostWave: 10 }]);
  });
});
