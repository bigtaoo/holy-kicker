import type { RunPost } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../meta/saveStore';
import { BoardOutbox, OUTBOX_CHARS, OUTBOX_KEY } from './boardOutbox';

const run = (chapter: number, wave: number, cmds = 0): RunPost => ({
  install: 'i', host: 'web', build: '1', game: 'monk', chapter, hard: false, won: false, wave, tenths: 900, level: 3, kills: 50, monk: 'kicker', relic: 'ball',
  replay: { engine: 49, config: {}, wave: 1, cmds: new Array(cmds).fill(1), tick: 10, hash: 1 },
} as RunPost);

describe('BoardOutbox', () => {
  it('keeps the best unanswered run per board until the server answers it', () => {
    const box = new BoardOutbox(new MemoryStore());
    box.put(run(1, 5));
    box.put(run(1, 4));
    box.put(run(2, 3));
    expect(box.list().map((r) => [r.chapter, r.wave])).toEqual([[1, 5], [2, 3]]);
    box.put(run(1, 7));
    expect(box.waiting('c1')).toBe(true);
    // the answer to the run of wave 5 leaves the better one waiting
    box.done(run(1, 5));
    expect(box.list().map((r) => r.wave)).toEqual([3, 7]);
    box.done(run(1, 7));
    expect(box.waiting('c1')).toBe(false);
    expect(box.waiting('c2')).toBe(true);
  });

  it('drops the oldest runs past its size, and reads a broken store as empty', () => {
    const store = new MemoryStore();
    const box = new BoardOutbox(store);
    // each number is two characters: three such runs pass the cap, two fit
    const big = Math.floor(OUTBOX_CHARS / 6);
    box.put(run(1, 5, big));
    box.put(run(2, 5, big));
    box.put(run(3, 5, big));
    expect(box.list().map((r) => r.chapter)).toEqual([2, 3]);
    box.put(run(4, 5, OUTBOX_CHARS));
    expect(box.list().map((r) => r.chapter)).toEqual([2, 3]);
    store.setItem(OUTBOX_KEY, '{nope');
    expect(box.list()).toEqual([]);
  });
});
