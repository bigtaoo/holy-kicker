import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { newSave, SAVE_VERSION } from './save';
import { newerBuildSave } from './saveFixture';
import { BACKUP_EVERY_MS, BACKUP_KEY, BROKEN_KEY, MemoryStore, SAVE_KEY, SaveStore } from './saveStore';

describe('SaveStore keeps what this build cannot read', () => {
  it('writes back unknown keys, longer arrays and bits this build cut off', () => {
    const kv = new MemoryStore();
    const stored = newerBuildSave();
    kv.setItem(SAVE_KEY, JSON.stringify(stored));
    const store = new SaveStore(kv);
    const s = store.load();
    expect(s.cleared).toBe(BALANCE.chapters);
    expect(s.best).toHaveLength(BALANCE.chapters);
    // the newer build's achievement is not read as every one claimed
    expect(s.achieved).toBe(0);
    store.save({ ...s, copper: 250, achieved: 1 });
    const back = JSON.parse(kv.getItem(SAVE_KEY)!);
    expect(back).toEqual({ ...stored, copper: 250, achieved: stored.achieved as number + 1 });
  });

  it('keeps an evolution this build does not know next to a new one', () => {
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, JSON.stringify(newerBuildSave()));
    const store = new SaveStore(kv);
    const s = store.load();
    expect(s.codex).toEqual([]);
    store.save({ ...s, codex: ['x' as never] });
    expect(JSON.parse(kv.getItem(SAVE_KEY)!).codex).toEqual(['x', 'someday-evolution']);
  });

  it('upgrades an older save without carrying its retired fields', () => {
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, JSON.stringify({ version: 5, copper: 9, hardCleared: 2 }));
    const store = new SaveStore(kv);
    store.save(store.load());
    const back = JSON.parse(kv.getItem(SAVE_KEY)!);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.copper).toBe(9);
    expect('hardCleared' in back).toBe(false);
  });
});

describe('SaveStore and a save from a newer version', () => {
  it('never writes over it, and plays this session from memory', () => {
    const kv = new MemoryStore();
    const text = JSON.stringify({ ...newSave(), version: SAVE_VERSION + 1, copper: 40, newThing: true });
    kv.setItem(SAVE_KEY, text);
    const store = new SaveStore(kv);
    const s = store.load();
    expect(store.readOnly).toBe(true);
    expect(s.copper).toBe(40);
    store.save({ ...s, copper: 90 });
    expect(kv.getItem(SAVE_KEY)).toBe(text);
    expect(kv.getItem(BACKUP_KEY)).toBeNull();
    // a reload in the same session (a portal sign-in) still sees this session's progress
    expect(store.load().copper).toBe(90);
    expect(store.readOnly).toBe(true);
    // the next launch reads the newer save untouched
    expect(new SaveStore(kv).load().copper).toBe(40);
  });

  it('reads a different save after the store changed under it (another account)', () => {
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, JSON.stringify({ ...newSave(), version: SAVE_VERSION + 1, copper: 40 }));
    const store = new SaveStore(kv);
    store.save({ ...store.load(), copper: 90 });
    kv.setItem(SAVE_KEY, JSON.stringify({ ...newSave(), copper: 7 }));
    expect(store.load().copper).toBe(7);
    expect(store.readOnly).toBe(false);
  });
});

describe('SaveStore and a broken save', () => {
  it('restores the backup and sets the broken copy aside', () => {
    const kv = new MemoryStore();
    new SaveStore(kv).save({ ...newSave(), copper: 55 });
    kv.setItem(SAVE_KEY, '{"copper": 5');
    const store = new SaveStore(kv);
    expect(store.load().copper).toBe(55);
    expect(store.restored).toBe(true);
    expect(kv.getItem(BROKEN_KEY)).toBe('{"copper": 5');
    store.save({ ...newSave(), copper: 60 });
    expect(new SaveStore(kv).load().copper).toBe(60);
  });

  it('starts afresh without a backup, keeping the broken copy', () => {
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, 'garbage');
    const store = new SaveStore(kv);
    expect(store.load()).toEqual(newSave());
    expect(store.restored).toBe(false);
    expect(kv.getItem(BROKEN_KEY)).toBe('garbage');
  });

  it('backs up at launch and then at most every few minutes', () => {
    let now = 0;
    const kv = new MemoryStore();
    kv.setItem(SAVE_KEY, JSON.stringify({ ...newSave(), copper: 1 }));
    const store = new SaveStore(kv, () => now);
    store.load();
    expect(JSON.parse(kv.getItem(BACKUP_KEY)!).copper).toBe(1);
    store.save({ ...newSave(), copper: 2 });
    expect(JSON.parse(kv.getItem(BACKUP_KEY)!).copper).toBe(1);
    now += BACKUP_EVERY_MS;
    store.save({ ...newSave(), copper: 3 });
    expect(JSON.parse(kv.getItem(BACKUP_KEY)!).copper).toBe(3);
  });
});
