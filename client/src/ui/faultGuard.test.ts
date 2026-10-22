import { describe, expect, it } from 'vitest';
import { FaultGuard, RECOVER_GAP_MS, REPORT_GAP_MS, STRIKE_MS, STRIKES } from './faultGuard';

function guard(): { g: FaultGuard; at(ms: number): void } {
  let t = 0;
  return { g: new FaultGuard(() => t), at: (ms) => (t = ms) };
}

describe('FaultGuard', () => {
  it('recovers from the first fault and reports it', () => {
    const { g } = guard();
    expect(g.fault()).toEqual({ report: true, act: 'recover' });
  });

  it('waits while a recovery is fresh and reports at most once per gap', () => {
    const { g, at } = guard();
    g.fault();
    at(RECOVER_GAP_MS - 1);
    expect(g.fault()).toEqual({ report: false, act: 'wait' });
    at(RECOVER_GAP_MS);
    expect(g.fault()).toEqual({ report: false, act: 'recover' });
    at(REPORT_GAP_MS);
    expect(g.fault().report).toBe(true);
  });

  it('restarts once recoveries keep failing, then only waits', () => {
    const { g, at } = guard();
    const acts = [];
    for (let i = 0; i < STRIKES; i++) {
      at(i * RECOVER_GAP_MS);
      acts.push(g.fault().act);
    }
    expect(acts).toEqual([...Array<string>(STRIKES - 1).fill('recover'), 'restart']);
    at(STRIKES * RECOVER_GAP_MS + STRIKE_MS);
    expect(g.fault().act).toBe('wait');
  });

  it('forgets recoveries older than the strike window', () => {
    const { g, at } = guard();
    for (let i = 0; i < STRIKES * 3; i++) {
      at(i * STRIKE_MS);
      expect(g.fault().act).toBe('recover');
    }
  });
});
