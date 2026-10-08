import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../meta/saveStore';
import { MirrorStore } from './mirrorStore';

describe('MirrorStore', () => {
  it('writes to localStorage and the native copy', () => {
    const local = new MemoryStore();
    const pushed: [string, string][] = [];
    const store = new MirrorStore({}, (k, v) => pushed.push([k, v]), local);
    store.setItem('hk.save', '{"jade":5}');
    expect(local.getItem('hk.save')).toBe('{"jade":5}');
    expect(pushed).toEqual([['hk.save', '{"jade":5}']]);
    expect(store.getItem('hk.save')).toBe('{"jade":5}');
  });

  it('restores from the native copy when WebKit lost its storage', () => {
    const store = new MirrorStore({ 'hk.save': '{"jade":9}' }, () => {}, new MemoryStore());
    expect(store.getItem('hk.save')).toBe('{"jade":9}');
    expect(store.getItem('hk.other')).toBeNull();
  });

  it('prefers localStorage over the launch copy after a reload', () => {
    const local = new MemoryStore();
    local.setItem('hk.save', '{"jade":12}');
    const store = new MirrorStore({ 'hk.save': '{"jade":9}' }, () => {}, local);
    expect(store.getItem('hk.save')).toBe('{"jade":12}');
  });

  it('keeps working when either side throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
    const store = new MirrorStore({ a: '1' }, () => { throw new Error('gone'); }, broken);
    expect(store.getItem('a')).toBe('1');
    expect(() => store.setItem('b', '2')).toThrow('quota');
    expect(store.getItem('b')).toBe('2');
  });
});
