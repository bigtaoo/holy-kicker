import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Game, Host, ReplayEnd, ReplayWire } from './protocol';

// Collected run replays (POST /v1/replays), for the operator to read what players do
// (`npm run replays -- --collected`). Collection is for the early days only: COLLECT says how
// many installs send them and until when, and the server tells each install whether it is one
// (GET /v1/replays/wanted); past `until` nobody sends any. The replays are kept as gzipped files
// on the box's disk (a docker volume), not in Mongo, and dropped after KEEP_DAYS.

/** Percent of installs asked for their replays, and the last day (UTC) they are asked. */
export const COLLECT = { percent: 100, until: '2026-12-31' };
export type CollectPlan = typeof COLLECT;
/** Days a collected replay is kept, and the most the shelf holds (past it new ones are refused). */
export const KEEP_DAYS = 15;
export const MAX_BYTES = 2 * 1024 ** 3;

/** A stored replay: `name` is the install's tag and the run's id. */
export const REPLAY_NAME = /^[A-Za-z0-9_-]{10}-[A-Za-z0-9_-]{8,64}$/;

export interface StoredReplay {
  /** The install's board tag (routes.ts tagOf), never its id: a player's runs group by it. */
  tag: string;
  host: Host;
  build: string;
  locale: string;
  game?: Game;
  end: ReplayEnd;
  at: number;
  replay: ReplayWire;
}

export interface ShelfEntry {
  name: string;
  at: number;
  bytes: number;
}

export interface ReplayShelf {
  /** Keeps `doc` under `name`, over an earlier one of that name; false when the shelf is full. */
  put(name: string, doc: StoredReplay): Promise<boolean>;
  /** The newest `limit` entries. */
  list(limit: number): Promise<ShelfEntry[]>;
  get(name: string): Promise<StoredReplay | null>;
  /** Drops what is older than KEEP_DAYS; how many went. */
  prune(now: number): Promise<number>;
}

/** Whether `install` is asked for its replays at `now`: a fixed share of installs, by a hash of the id. */
export function wantsReplays(install: string, now: number, plan: CollectPlan = COLLECT): boolean {
  if (now >= Date.parse(`${plan.until}T00:00:00Z`) + 24 * 3600_000) return false;
  return createHash('sha256').update(install).digest().readUInt16BE(0) % 100 < plan.percent;
}

const KEEP_MS = KEEP_DAYS * 24 * 3600_000;

/** For development and the tests. */
export class MemoryShelf implements ReplayShelf {
  readonly docs = new Map<string, StoredReplay>();

  async put(name: string, doc: StoredReplay): Promise<boolean> {
    this.docs.set(name, doc);
    return true;
  }

  async list(limit: number): Promise<ShelfEntry[]> {
    return [...this.docs].map(([name, d]) => ({ name, at: d.at, bytes: JSON.stringify(d).length })).sort((a, b) => b.at - a.at).slice(0, limit);
  }

  async get(name: string): Promise<StoredReplay | null> {
    return this.docs.get(name) ?? null;
  }

  async prune(now: number): Promise<number> {
    let n = 0;
    for (const [name, d] of this.docs) if (d.at < now - KEEP_MS) this.docs.delete(name), n++;
    return n;
  }
}

/** One `<name>.json.gz` per replay in `dir`; their sizes and times are kept in memory to list and cap them. */
export class DiskShelf implements ReplayShelf {
  private constructor(
    private readonly dir: string,
    private readonly files: Map<string, { at: number; bytes: number }>,
    private readonly maxBytes: number,
  ) {}

  static async open(dir: string, maxBytes = MAX_BYTES): Promise<DiskShelf> {
    await mkdir(dir, { recursive: true });
    const files = new Map<string, { at: number; bytes: number }>();
    for (const f of await readdir(dir)) {
      if (!f.endsWith('.json.gz')) continue;
      const s = await stat(join(dir, f));
      files.set(f.slice(0, -'.json.gz'.length), { at: s.mtimeMs, bytes: s.size });
    }
    return new DiskShelf(dir, files, maxBytes);
  }

  private get bytes(): number {
    let n = 0;
    for (const f of this.files.values()) n += f.bytes;
    return n;
  }

  async put(name: string, doc: StoredReplay): Promise<boolean> {
    const zip = gzipSync(JSON.stringify(doc));
    if (this.bytes - (this.files.get(name)?.bytes ?? 0) + zip.length > this.maxBytes) return false;
    // written aside and renamed, so a reader never sees half a file; dated `at`, as a reopened shelf reads it
    const path = join(this.dir, `${name}.json.gz`);
    await writeFile(`${path}.tmp`, zip);
    await utimes(`${path}.tmp`, doc.at / 1000, doc.at / 1000);
    await rename(`${path}.tmp`, path);
    this.files.set(name, { at: doc.at, bytes: zip.length });
    return true;
  }

  async list(limit: number): Promise<ShelfEntry[]> {
    return [...this.files].map(([name, f]) => ({ name, ...f })).sort((a, b) => b.at - a.at).slice(0, limit);
  }

  async get(name: string): Promise<StoredReplay | null> {
    if (!this.files.has(name)) return null;
    return JSON.parse(gunzipSync(await readFile(join(this.dir, `${name}.json.gz`))).toString('utf8')) as StoredReplay;
  }

  async prune(now: number): Promise<number> {
    let n = 0;
    for (const [name, f] of this.files) {
      if (f.at >= now - KEEP_MS) continue;
      await unlink(join(this.dir, `${name}.json.gz`)).catch(() => undefined);
      this.files.delete(name);
      n++;
    }
    return n;
  }
}
