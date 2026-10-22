import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../meta/saveStore';
import { AnomalyStash, STASH_KEY, STASH_MAX } from './anomalyStash';

describe('AnomalyStash', () => {
  it('keeps the newest events across launches and empties on take', () => {
    const storage = new MemoryStore();
    const first = new AnomalyStash(storage);
    for (let i = 0; i < STASH_MAX + 3; i++) first.push({ kind: 'error', place: 'run', msg: `e${i}` });
    const later = new AnomalyStash(storage).take();
    expect(later).toHaveLength(STASH_MAX);
    expect(later[0].msg).toBe('e3');
    expect(new AnomalyStash(storage).take()).toEqual([]);
  });

  it('drops what is not an anomaly and survives a broken entry', () => {
    const storage = new MemoryStore();
    storage.setItem(STASH_KEY, JSON.stringify([{ kind: 'stall', place: 'run', ms: 1200 }, { kind: 'nope', place: 'run' }, null]));
    expect(new AnomalyStash(storage).take()).toEqual([{ kind: 'stall', place: 'run', ms: 1200 }]);
    storage.setItem(STASH_KEY, '{oops');
    expect(new AnomalyStash(storage).take()).toEqual([]);
  });
});
