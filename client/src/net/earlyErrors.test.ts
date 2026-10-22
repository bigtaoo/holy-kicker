import { describe, expect, it } from 'vitest';
import { catchEarlyErrors, EARLY_MAX, takeEarlyErrors } from './earlyErrors';

/** A window's error events, fired by hand. */
function fakeWindow() {
  const on = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener: (type: string, fn: (e: unknown) => void) => void (on.get(type) ?? on.set(type, new Set()).get(type)!).add(fn),
    removeEventListener: (type: string, fn: (e: unknown) => void) => void on.get(type)?.delete(fn),
    fire: (type: string, e: unknown) => on.get(type)?.forEach((fn) => fn(e)),
    count: () => [...on.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe('early errors', () => {
  it('keeps errors and rejections until taken, then stops listening', () => {
    takeEarlyErrors();
    const win = fakeWindow();
    catchEarlyErrors(win as never);
    win.fire('error', { error: new Error('boom'), filename: 'https://h.gamestao.com/assets/index-abc.js?v=1', lineno: 1, colno: 99 });
    win.fire('unhandledrejection', { reason: 'no art' });
    expect(takeEarlyErrors()).toEqual([{ msg: 'boom', src: 'index-abc.js:1:99' }, { msg: 'no art' }]);
    expect(win.count()).toBe(0);
    win.fire('error', { message: 'later' });
    expect(takeEarlyErrors()).toEqual([]);
  });

  it(`keeps only the first ${EARLY_MAX}`, () => {
    takeEarlyErrors();
    const win = fakeWindow();
    catchEarlyErrors(win as never);
    for (let i = 0; i < EARLY_MAX + 5; i++) win.fire('unhandledrejection', { reason: `e${i}` });
    const kept = takeEarlyErrors();
    expect(kept).toHaveLength(EARLY_MAX);
    expect(kept[0]!.msg).toBe('e0');
  });

  it('does nothing without a window', () => {
    takeEarlyErrors();
    catchEarlyErrors(undefined);
    expect(takeEarlyErrors()).toEqual([]);
  });
});
