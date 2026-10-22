import { readCode, showCode, type CloudCopy, type CloudSlot, type Game, type GcIdentity } from '@hk/protocol';
import { readSave, saveObject, SAVE_VERSION, versionOf } from '../meta/save';
import { keep } from '../meta/saveKeep';
import { mergeSaves } from '../meta/saveMerge';
import { SAVE_KEY, type KeyValueStore, type SaveStore } from '../meta/saveStore';

// The cloud save on the device (docs/cloud-save.md "The cloud save"): a slot on the backend,
// reached by its restore code, merged with this device's save at launch, as the game goes to the
// background and when the player backs up or restores from settings.

/** Where this device keeps its restore code, beside the save (themed: the corgi's under `corgi:`). */
export const CLOUD_KEY = 'hk.cloud';
/** A background sync waits this long after the last one (ms). */
export const SYNC_EVERY_MS = 60_000;
const TIMEOUT_MS = 8000;

/** What the settings rows say under the buttons; null says nothing. */
export type CloudStatus = 'working' | 'synced' | 'restored' | 'badCode' | 'noSlot' | 'failed' | 'update' | 'copied' | 'copyFailed' | null;

/** The cloud save as the settings panel sees it (ui/cloudRows.ts). */
export interface CloudUi {
  /** The restore code as shown (`ABCD-EFGH-JKMN`), null before a backup or a restore. */
  code(): string | null;
  status(): CloudStatus;
  busy(): boolean;
  backup(): void;
  restore(): void;
  /** Copies the code, from a tap; unset where there is no clipboard. */
  copy?: () => void;
  /** Calls `cb` on every change; returns the call that stops it. */
  listen(cb: () => void): () => void;
}

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
  askCode(): Promise<string | null>;
  copyText?: (text: string) => Promise<boolean>;
  fetch?: typeof fetch;
  now?: () => number;
}

type Answer<T> = { status: number; body: T | null };

export class CloudSync implements CloudUi {
  /** Game Center's signed identity (iOS, bridge v5); set by the iOS entry. */
  gcIdentity: (() => Promise<GcIdentity | null>) | null = null;
  copy?: () => void;
  private said: CloudStatus = null;
  private working = false;
  private last = -Infinity;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly h: CloudHost) {
    if (h.copyText) {
      const copyText = h.copyText;
      this.copy = () => {
        const code = this.code();
        if (code) void copyText(code).then((ok) => this.say(ok ? 'copied' : 'copyFailed'));
      };
    }
  }

  code(): string | null {
    const c = readCode(this.h.kv.getItem(CLOUD_KEY) ?? '');
    return c ? showCode(c) : null;
  }

  status(): CloudStatus {
    return this.working ? 'working' : this.said;
  }

  busy(): boolean {
    return this.working;
  }

  listen(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** A sync in the background (launch, the game going away): at most once a minute, and only with a code. */
  auto(): void {
    const now = (this.h.now ?? Date.now)();
    if (this.working || !this.code() || now - this.last < SYNC_EVERY_MS) return;
    this.last = now;
    void this.run(() => this.sync(), false);
  }

  backup(): void {
    void this.run(async () => {
      if (!this.code()) {
        const slot = (await this.gcSlot(true)) ?? (await this.post<CloudSlot>('new', {})).body;
        if (!slot?.code) return 'failed';
        this.h.kv.setItem(CLOUD_KEY, slot.code);
      }
      return this.sync();
    });
  }

  restore(): void {
    void this.run(async () => {
      const found = await this.gcSlot(false);
      let code = found?.code ?? null;
      if (!code) {
        const typed = await this.h.askCode();
        if (typed === null) return null;
        code = readCode(typed);
        if (!code) return 'badCode';
      }
      const before = this.h.kv.getItem(CLOUD_KEY);
      this.h.kv.setItem(CLOUD_KEY, code);
      const said = await this.sync();
      // a code that leads nowhere does not replace the one this device had
      if (said === 'noSlot') this.h.kv.setItem(CLOUD_KEY, before ?? '');
      return said === 'synced' ? 'restored' : said;
    });
  }

  /** Reads the slot, merges it into this device's save, writes the merge back (once more after a 409). */
  async sync(): Promise<CloudStatus> {
    const code = readCode(this.h.kv.getItem(CLOUD_KEY) ?? '');
    if (!code || this.h.store.readOnly) return null;
    let copy = await this.post<CloudCopy>('read', { code });
    if (copy.status === 404) return 'noSlot';
    for (let tries = 0; tries < 2; tries++) {
      if (!copy.body) return 'failed';
      const { rev, save } = copy.body;
      const raw = saveObject(save);
      if (versionOf(raw) > SAVE_VERSION) return 'update';
      if (this.h.playing()) return null;
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

  /** This player's slot through Game Center (iOS), null without a signed identity or a slot. */
  private async gcSlot(create: boolean): Promise<CloudSlot | null> {
    const identity = await this.gcIdentity?.().catch(() => null);
    if (!identity) return null;
    return (await this.post<CloudSlot>('gc', { identity, create })).body;
  }

  private async run(task: () => Promise<CloudStatus>, loud = true): Promise<void> {
    if (this.working) return;
    this.working = true;
    this.say(loud ? null : this.said);
    let said: CloudStatus = 'failed';
    try {
      said = await task();
    } catch {
      /* said stays 'failed' */
    }
    this.working = false;
    // a background sync speaks only when something needs the player
    this.say(loud || said === 'update' ? said : this.said);
  }

  private say(status: CloudStatus): void {
    this.said = status;
    for (const cb of this.listeners) cb();
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
