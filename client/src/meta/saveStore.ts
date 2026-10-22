import { readSave, saveObject, SAVE_VERSION, versionOf, type SaveData } from './save';
import { keep } from './saveKeep';

// Where the save lives is the host's business (localStorage, the CrazyGames data module,
// WeChat storage); the game only sees this synchronous key/value pair.

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A store that only lives in memory, for hosts whose storage throws or is missing. */
export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** Reads `primary`, and keeps going in memory when it throws (blocked storage, quota). */
export class SafeStore implements KeyValueStore {
  private readonly memory = new MemoryStore();
  constructor(private readonly primary: KeyValueStore | null) {}

  getItem(key: string): string | null {
    try {
      return this.primary?.getItem(key) ?? this.memory.getItem(key);
    } catch {
      return this.memory.getItem(key);
    }
  }

  setItem(key: string, value: string): void {
    this.memory.setItem(key, value);
    try {
      this.primary?.setItem(key, value);
    } catch {
      /* the memory copy keeps this session going */
    }
  }
}

const clone = (data: SaveData): SaveData => JSON.parse(JSON.stringify(data)) as SaveData;

export const SAVE_KEY = 'hk.save';
/** The last save that read whole, restored when the main copy is broken. */
export const BACKUP_KEY = 'hk.save.bak';
/** A main copy that did not read, kept once for a problem report instead of being written over. */
export const BROKEN_KEY = 'hk.save.broken';
/** The backup follows the save at most this often (and at each launch). */
export const BACKUP_EVERY_MS = 5 * 60_000;

/**
 * The save in a key/value store, written so that no build destroys what it cannot read
 * (docs/cloud-save.md "Older builds"): a save from a newer build (a higher version) is played
 * from memory and never written over; one of this version keeps, on every write, what this
 * build could not read (saveKeep.ts); a broken main copy is set aside and the backup read.
 */
export class SaveStore {
  /** True while the stored save is from a newer build: this session's progress stays in memory. */
  readOnly = false;
  /** True when the last load found the main copy broken and read the backup instead. */
  restored = false;
  /** The stored object of this version, and how this build read it (null: nothing to keep). */
  private raw: Record<string, unknown> | null = null;
  private seen: SaveData | null = null;
  /** In read-only mode: the stored text being shadowed, and this session's save over it. */
  private shadowed: string | null = null;
  private held: string | null = null;
  private backedUp = -Infinity;

  constructor(private readonly kv: KeyValueStore, private readonly now: () => number = Date.now) {}

  load(): SaveData {
    const text = this.kv.getItem(SAVE_KEY);
    if (this.readOnly && this.held !== null && text === this.shadowed) return this.read(saveObject(this.held), text);
    let raw = saveObject(text);
    this.restored = false;
    if (!raw && text) {
      if (this.kv.getItem(BROKEN_KEY) !== text) this.kv.setItem(BROKEN_KEY, text);
      raw = saveObject(this.kv.getItem(BACKUP_KEY));
      this.restored = raw !== null;
    }
    return this.read(raw, text);
  }

  /** The save as last read or written, without touching the store (the cloud sync merges into it). */
  current(): SaveData {
    return this.seen ? clone(this.seen) : this.load();
  }

  save(data: SaveData): void {
    const text = JSON.stringify(this.raw ? keep(data, this.seen, this.raw) : data);
    this.seen = clone(data);
    if (this.readOnly) {
      this.held = text;
      return;
    }
    this.raw = saveObject(text);
    this.kv.setItem(SAVE_KEY, text);
    if (this.now() - this.backedUp >= BACKUP_EVERY_MS) {
      this.kv.setItem(BACKUP_KEY, text);
      this.backedUp = this.now();
    }
  }

  private read(raw: Record<string, unknown> | null, text: string | null): SaveData {
    const version = versionOf(raw);
    this.readOnly = version > SAVE_VERSION;
    this.shadowed = this.readOnly ? text : null;
    if (!this.readOnly) this.held = null;
    // an older save is upgraded, not kept: its unknown keys are fields this build retired
    this.raw = version >= SAVE_VERSION ? raw : null;
    const data = readSave(raw);
    this.seen = clone(data);
    // a save that read whole is the backup from each launch on
    if (raw && !this.readOnly && !this.restored && text !== null && this.kv.getItem(BACKUP_KEY) !== text) {
      this.kv.setItem(BACKUP_KEY, text);
      this.backedUp = this.now();
    }
    return data;
  }
}
