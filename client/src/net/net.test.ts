import { LIMITS } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import { apiBase, DEFAULT_API } from './backend';
import { EventQueue, newId, QUEUE_CAP } from './events';

describe('backend', () => {
  it('finds the API, offline in development and on WeChat unless ?api= says otherwise', () => {
    const q = (s = '') => new URLSearchParams(s);
    expect(apiBase('crazygames', false, q(), undefined)).toBe(DEFAULT_API);
    expect(apiBase('web', false, q(), 'https://x.test/')).toBe('https://x.test');
    expect(apiBase('web', true, q(), undefined)).toBeNull();
    expect(apiBase('wechat', false, q(), undefined)).toBeNull();
    expect(apiBase('web', true, q('api=http://localhost:8080'), undefined)).toBe('http://localhost:8080');
    expect(apiBase('crazygames', false, q('api=off'), undefined)).toBeNull();
  });

  it('makes ids the server takes', () => {
    const id = newId(Math.random);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
    expect(id.length).toBeGreaterThanOrEqual(LIMITS.idMin);
    expect(id.length).toBeLessThanOrEqual(LIMITS.idMax);
  });

  it('queues events in batches, keeps the newest past the cap, and takes a failed batch back first', () => {
    const q = new EventQueue();
    for (let i = 0; i < QUEUE_CAP + 10; i++) q.push('run_start', i);
    expect(q.size).toBe(QUEUE_CAP);
    const first = q.take();
    expect(first.length).toBe(LIMITS.batchEvents);
    expect(first[0].t).toBe(10);
    q.restore(first);
    expect(q.take()[0].t).toBe(10);
    q.push('session', 1, { a: 1 });
    expect(q.size).toBe(QUEUE_CAP - LIMITS.batchEvents + 1);
  });
});
