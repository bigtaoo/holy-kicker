import { parseSave, type SaveData } from './save';

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

export const SAVE_KEY = 'hk.save';

export class SaveStore {
  constructor(private readonly kv: KeyValueStore) {}

  load(): SaveData {
    return parseSave(this.kv.getItem(SAVE_KEY));
  }

  save(data: SaveData): void {
    this.kv.setItem(SAVE_KEY, JSON.stringify(data));
  }
}
