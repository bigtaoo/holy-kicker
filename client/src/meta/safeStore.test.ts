import { describe, expect, it } from 'vitest';
import { newSave } from './save';
import { MemoryStore, SafeStore, SAVE_KEY, SaveStore, type KeyValueStore } from './saveStore';

/** A store that takes writes until `full` is set, like localStorage past its quota or a WeChat key past 1 MB. */
class QuotaStore implements KeyValueStore {
  readonly disk = new MemoryStore();
  full = false;
  getItem(key: string): string | null {
    return this.disk.getItem(key);
  }
  setItem(key: string, value: string): void {
    if (this.full) throw new Error('QuotaExceededError');
    this.disk.setItem(key, value);
  }
}

describe('SafeStore', () => {
  it('reads and writes through to the primary', () => {
    const primary = new MemoryStore();
    const kv = new SafeStore(primary);
    kv.setItem('a', '1');
    expect(primary.getItem('a')).toBe('1');
    primary.setItem('b', '2');
    expect(kv.getItem('b')).toBe('2');
    expect(kv.getItem('c')).toBeNull();
  });

  it('keeps going in memory without a primary, or with one that always throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    for (const kv of [new SafeStore(null), new SafeStore(broken)]) {
      expect(kv.getItem('a')).toBeNull();
      kv.setItem('a', '1');
      expect(kv.getItem('a')).toBe('1');
    }
  });

  it('reads a key whose last write failed from memory, not the older value on the primary', () => {
    const primary = new QuotaStore();
    const kv = new SafeStore(primary);
    kv.setItem('a', 'old');
    primary.full = true;
    kv.setItem('a', 'new');
    expect(primary.getItem('a')).toBe('old');
    expect(kv.getItem('a')).toBe('new');
    // once a write goes through again the primary is read as before
    primary.full = false;
    kv.setItem('a', 'newer');
    primary.disk.setItem('a', 'from elsewhere');
    expect(kv.getItem('a')).toBe('from elsewhere');
  });

  it('lets a save that could not be written survive a reload of the save', () => {
    const primary = new QuotaStore();
    const store = new SaveStore(new SafeStore(primary));
    store.save({ ...newSave(), copper: 10 });
    primary.full = true;
    store.save({ ...newSave(), copper: 500 });
    expect(JSON.parse(primary.getItem(SAVE_KEY)!).copper).toBe(10);
    // a reload (Shell.reloadSave after a cloud sync) must not roll the session back
    expect(store.load().copper).toBe(500);
  });
});
