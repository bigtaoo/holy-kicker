import { describe, expect, it } from 'vitest';
import { BootTrail, TRAIL_ERRORS, TRAIL_KEY } from './bootTrail';

function kv() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('the boot trail', () => {
  it('reports nothing after a launch that finished', () => {
    const store = kv();
    let t = 0;
    const first = new BootTrail(store, '1.0.3.3', 'abc', () => t);
    expect(first.last).toBe(null);
    t = 900;
    first.step('started');
    first.done();
    expect(store.m.has(TRAIL_KEY)).toBe(false);
    expect(new BootTrail(store, '1.0.3.3', 'abc', () => 0).last).toBe(null);
  });

  it('tells the next launch how far an unfinished one got', () => {
    const store = kv();
    let t = 100;
    const trail = new BootTrail(store, '1.0.3.2', '7c3ce06', () => t);
    t = 350.4;
    trail.step('gl', 'res=3 msaa=1');
    t = 1200;
    trail.step('art');
    for (let i = 0; i < TRAIL_ERRORS + 2; i++) trail.error(`boom ${i}`);
    expect(new BootTrail(store, '1.0.3.3', 'def', () => 0).last).toEqual({
      kind: 'boot_fail', place: 'boot', stage: 'art', ms: 1100, bundle: '1.0.3.2', build: '7c3ce06', info: 'res=3 msaa=1', msg: 'boom 0', errors: TRAIL_ERRORS,
    });
  });

  it('survives a broken record and a storage that throws', () => {
    const store = kv();
    store.setItem(TRAIL_KEY, '{nope');
    expect(new BootTrail(store, '1', 'b', () => 0).last).toBe(null);
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const trail = new BootTrail(broken, '1', 'b', () => 0);
    trail.step('art');
    trail.done();
    expect(trail.last).toBe(null);
  });
});
