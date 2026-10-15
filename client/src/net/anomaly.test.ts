import { ANOMALY_CAP, LIMITS, STALL_MAX_MS, STALL_MS } from '@hk/protocol';
import { describe, expect, it } from 'vitest';
import { AnomalyCap, cleanMsg, errorSource, StallWatch } from './anomaly';

describe('AnomalyCap', () => {
  it('lets each kind through a few times a session, each on its own count', () => {
    const cap = new AnomalyCap();
    const errors = Array.from({ length: ANOMALY_CAP + 2 }, () => cap.pass('error'));
    expect(errors.filter(Boolean)).toHaveLength(ANOMALY_CAP);
    expect(cap.pass('stall')).toBe(true);
  });
});

describe('cleanMsg', () => {
  it('keeps printable text, folds whitespace and cuts to the prop limit', () => {
    expect(cleanMsg(new TypeError('x is\n\tundefined'))).toBe('x is undefined');
    expect(cleanMsg('bad\u0000 char 中文 here')).toBe('bad char here');
    expect(cleanMsg('a'.repeat(200))).toHaveLength(LIMITS.propString);
    expect(cleanMsg(undefined)).toBe('unknown');
    expect(cleanMsg(42)).toBe('42');
  });
});

describe('StallWatch', () => {
  it('flags a long visible frame', () => {
    const w = new StallWatch();
    expect(w.frame(16, false)).toBe(false);
    expect(w.frame(STALL_MS, false)).toBe(true);
  });

  it('never flags frames seen while hidden, or the first one back', () => {
    const w = new StallWatch();
    expect(w.frame(3000, true)).toBe(false);
    expect(w.frame(3000, false)).toBe(false);
    expect(w.frame(3000, false)).toBe(true);
  });

  it('takes a very long gap for a pause the page did not announce, not a stall', () => {
    const w = new StallWatch();
    expect(w.frame(STALL_MAX_MS, false)).toBe(false);
    expect(w.frame(STALL_MAX_MS - 1, false)).toBe(true);
  });

  it('skips the frame that straddles a trip to the background', () => {
    const w = new StallWatch();
    w.hide();
    expect(w.frame(60_000, false)).toBe(false);
    expect(w.frame(16, false)).toBe(false);
    expect(w.frame(2000, false)).toBe(true);
  });
});

describe('errorSource', () => {
  it('keeps the file name with line and column', () => {
    expect(errorSource('https://h.gamestao.com/assets/index-Ab12.js?v=3', 1, 23456)).toBe('index-Ab12.js:1:23456');
    expect(errorSource('game.js', 0, 0)).toBe('game.js');
    expect(errorSource('', 3, 4)).toBe('');
    expect(errorSource(undefined, 3, 4)).toBe('');
  });
});
