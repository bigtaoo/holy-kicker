import type { KeyValueStore } from '../../meta/saveStore';

/**
 * The iOS key store: WebKit's localStorage plus a copy in the shell's UserDefaults, so the save
 * survives iOS clearing the web view's storage (low disk, a WebKit update). Writes go to both.
 * Reads prefer localStorage and fall back to the native copy, which the shell hands over once at
 * launch (`saved`): after the web view reloads mid-session (its process was killed) that launch
 * copy is older than localStorage, and only a wiped localStorage should ever reach for it.
 */
export class MirrorStore implements KeyValueStore {
  private readonly copy: Map<string, string>;

  constructor(
    saved: Record<string, string>,
    private readonly push: (key: string, value: string) => void,
    private readonly local: KeyValueStore | null,
  ) {
    this.copy = new Map(Object.entries(saved).filter(([, v]) => typeof v === 'string'));
  }

  getItem(key: string): string | null {
    let value: string | null = null;
    try {
      value = this.local?.getItem(key) ?? null;
    } catch {
      /* blocked: the native copy answers */
    }
    return value ?? this.copy.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.copy.set(key, value);
    try {
      this.push(key, value);
    } catch {
      /* localStorage still has it */
    }
    this.local?.setItem(key, value);
  }
}
