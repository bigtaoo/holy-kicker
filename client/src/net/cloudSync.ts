import { readCode, type CloudCopy, type CloudSlot, type Game, type GcIdentity } from '@hk/protocol';
import { readSave, saveObject, SAVE_VERSION, versionOf } from '../meta/save';
import { keep } from '../meta/saveKeep';
import { mergeSaves } from '../meta/saveMerge';
import { SAVE_KEY, type KeyValueStore, type SaveStore } from '../meta/saveStore';

// The cloud save on the device (docs/cloud-save.md "The cloud save"): a slot on the backend that
// the device finds or makes by itself and merges with its own save at launch, as the game goes to
// the background and when the player signs in to the host's account. The player never sees it:
// a failure says nothing and waits for the next chance.

/** This device's key to its slot, beside the save (themed: the corgi's under `corgi:`). Never shown. */
export const CLOUD_KEY = 'hk.cloud';
/** The Game Center player whose slot `CLOUD_KEY` opens; unset while it is the device's own. */
export const CLOUD_GC_KEY = 'hk.cloud.gc';
/** A background sync waits this long after the last one (ms). */
export const SYNC_EVERY_MS = 60_000;
const TIMEOUT_MS = 8000;

/** How a pass went; only tests read it. `skipped`: nothing to do now (a run on, a read-only save). */
export type SyncResult = 'synced' | 'noSlot' | 'failed' | 'update' | 'skipped';

/** What the sync needs from the host and the shell. */
export interface CloudHost {
  base: string;
  game: Game;
  kv: KeyValueStore;
  store: SaveStore;
  /** Puts a merged save in play (Shell.reloadSave); the store already holds it. */
  reload(): void;
  /** True while a run is on: the save is not touched under it. */
  playing(): boolean;
  fetch?: typeof fetch;
  now?: () => number;
}

type Answer<T> = { status: number; body: T | null };

export class CloudSync {
  /** Game Center's signed identity (iOS, bridge v5); set by the iOS entry. */
  gcIdentity: (() => Promise<GcIdentity | null>) | null = null;
  private working = false;
  private again = false;
  private last = -Infinity;

  constructor(private readonly h: CloudHost) {}

  busy(): boolean {
    return this.working;
  }

  /** A sync in the background (launch, the game going away): at most once a minute. */
  auto(): void {
    const now = (this.h.now ?? Date.now)();
    if (this.working || now - this.last < SYNC_EVERY_MS) return;
    this.last = now;
    void this.syncNow();
  }

  /** The host's account changed (a Game Center sign-in): sync now, after a pass in flight. */
  account(): void {
    this.last = (this.h.now ?? Date.now)();
    if (this.working) this.again = true;
    else void this.syncNow();
  }

  /** One pass: finds or makes the slot, merges it with the save and writes the merge back. Never throws. */
  async syncNow(): Promise<SyncResult> {
    if (this.working) return 'skipped';
    this.working = true;
    let result: SyncResult = 'failed';
    try {
      result = await this.pass();
    } catch {
      /* stays 'failed': the next chance tries again */
    }
    this.working = false;
    if (this.again) {
      this.again = false;
      void this.syncNow();
    }
    return result;
  }

  private code(): string | null {
    return readCode(this.h.kv.getItem(CLOUD_KEY) ?? '');
  }

  private async pass(): Promise<SyncResult> {
    if (this.h.store.readOnly) return 'skipped';
    let code = this.code();
    const identity = await this.gcIdentity?.().catch(() => null);
    if (identity && this.h.kv.getItem(CLOUD_GC_KEY) !== identity.player) {
      // the account's slot, found or made; the device's own slot is merged into the save first,
      // so what it held goes on into the account's
      const slot = (await this.post<CloudSlot>('gc', { identity, create: true })).body;
      const found = slot?.code ? readCode(slot.code) : null;
      if (found) {
        if (code && code !== found) {
          const own = await this.sync(code);
          if (own !== 'synced' && own !== 'noSlot') return own;
        }
        this.h.kv.setItem(CLOUD_KEY, (code = found));
        this.h.kv.setItem(CLOUD_GC_KEY, identity.player);
      }
    }
    if (!code) {
      const slot = (await this.post<CloudSlot>('new', {})).body;
      code = slot?.code ? readCode(slot.code) : null;
      if (!code) return 'failed';
      this.h.kv.setItem(CLOUD_KEY, code);
    }
    const result = await this.sync(code);
    if (result === 'noSlot') {
      // dropped after 30 days unwritten: the next pass makes (or finds) one again
      this.h.kv.setItem(CLOUD_KEY, '');
      this.h.kv.setItem(CLOUD_GC_KEY, '');
    }
    return result;
  }

  /** Reads the slot, merges it into this device's save, writes the merge back (once more after a 409). */
  private async sync(code: string): Promise<SyncResult> {
    let copy = await this.post<CloudCopy>('read', { code });
    if (copy.status === 404) return 'noSlot';
    for (let tries = 0; tries < 2; tries++) {
      if (!copy.body) return 'failed';
      const { rev, save } = copy.body;
      const raw = saveObject(save);
      if (versionOf(raw) > SAVE_VERSION) return 'update';
      if (this.h.playing()) return 'skipped';
      const upload = this.merge(raw);
      if (upload === null) return 'failed';
      const wrote = await this.post<CloudCopy>('write', { code, base: rev, save: upload });
      if (wrote.status === 200) return 'synced';
      if (wrote.status !== 409) return wrote.status === 404 ? 'noSlot' : 'failed';
      copy = wrote;
    }
    return 'failed';
  }

  /** The slot's save merged into the store; the text to upload, null when there is none. */
  private merge(raw: Record<string, unknown> | null): string | null {
    const local = this.h.store.current();
    const cloud = raw ? readSave(raw) : null;
    const merged = cloud ? mergeSaves(local, cloud) : local;
    if (JSON.stringify(merged) !== JSON.stringify(local)) {
      this.h.store.save(merged);
      this.h.reload();
    }
    // the slot's object of this version keeps what this build could not read of it
    if (raw && cloud && versionOf(raw) === SAVE_VERSION) return JSON.stringify(keep(merged, cloud, raw));
    return this.h.kv.getItem(SAVE_KEY) ?? JSON.stringify(merged);
  }

  private async post<T>(op: string, body: object): Promise<Answer<T>> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await (this.h.fetch ?? fetch)(`${this.h.base}/v1/cloud/${op}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: this.h.game, ...body }),
        signal: abort.signal,
      });
      const text = await res.text();
      return { status: res.status, body: text ? (JSON.parse(text) as T) : null };
    } catch {
      return { status: 0, body: null };
    } finally {
      clearTimeout(timer);
    }
  }
}
