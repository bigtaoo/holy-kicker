import { MongoClient, MongoServerError, type Collection } from 'mongodb';
import { CLOUD_LIMITS, type Game } from './protocol';

// Where the cloud saves live (docs/cloud-save.md "The server"): one slot per player, by its
// restore code. The routes (cloudSave.ts) only see CloudVault; MongoVault is the real one, in its
// own collection `cloud`, MemoryVault serves the tests and a local run.

export interface Slot {
  game: Game;
  rev: number;
  /** The save's version (0 while empty), and its text (null while empty). */
  version: number;
  save: string | null;
}

export type WriteOutcome = 'ok' | 'stale' | 'none';

export interface CloudVault {
  /** Makes an empty slot; false when the code, or the Game Center key `gc`, already has one. */
  create(code: string, game: Game, gc: string | null, now: number): Promise<boolean>;
  /** The code of the slot made for Game Center key `gc`. */
  byGc(gc: string): Promise<string | null>;
  read(code: string): Promise<Slot | null>;
  /** Writes `save` over revision `base`: 'stale' when the slot moved on or holds a higher version. */
  write(code: string, base: number, version: number, save: string, now: number): Promise<WriteOutcome>;
}

export class MemoryVault implements CloudVault {
  readonly slots = new Map<string, Slot & { gc: string | null; at: number }>();

  async create(code: string, game: Game, gc: string | null, now: number): Promise<boolean> {
    if (this.slots.has(code) || (gc && [...this.slots.values()].some((s) => s.gc === gc))) return false;
    this.slots.set(code, { game, rev: 0, version: 0, save: null, gc, at: now });
    return true;
  }

  async byGc(gc: string): Promise<string | null> {
    for (const [code, s] of this.slots) if (s.gc === gc) return code;
    return null;
  }

  async read(code: string): Promise<Slot | null> {
    const s = this.slots.get(code);
    return s ? { game: s.game, rev: s.rev, version: s.version, save: s.save } : null;
  }

  async write(code: string, base: number, version: number, save: string, now: number): Promise<WriteOutcome> {
    const s = this.slots.get(code);
    if (!s) return 'none';
    if (s.rev !== base || version < s.version) return 'stale';
    Object.assign(s, { rev: s.rev + 1, version, save, at: now });
    return 'ok';
  }
}

interface SlotDoc {
  _id: string;
  game: Game;
  rev: number;
  version: number;
  save: string | null;
  at: Date;
  gc?: string;
}

/** The `cloud` collection, on a connection of its own (a small pool: a sync is a read and a write). */
export class MongoVault implements CloudVault {
  private constructor(private readonly client: MongoClient, private readonly slots: Collection<SlotDoc>) {}

  static async open(uri: string, dbName: string): Promise<MongoVault> {
    const client = new MongoClient(uri, { maxPoolSize: 3, appName: 'holykicker-cloud' });
    await client.connect();
    const db = client.db(dbName);
    const slots = db.collection<SlotDoc>('cloud');
    const ttl = CLOUD_LIMITS.slotDays * 86_400;
    await Promise.all([
      slots.createIndex({ gc: 1 }, { unique: true, sparse: true }),
      // An index made with another TTL (two years until 2026-10) conflicts (code 85): change it in place.
      slots.createIndex({ at: 1 }, { expireAfterSeconds: ttl }).catch(async (err: unknown) => {
        if (!(err instanceof MongoServerError && err.code === 85)) throw err;
        await db.command({ collMod: 'cloud', index: { keyPattern: { at: 1 }, expireAfterSeconds: ttl } });
      }),
    ]);
    return new MongoVault(client, slots);
  }

  async create(code: string, game: Game, gc: string | null, now: number): Promise<boolean> {
    try {
      await this.slots.insertOne({ _id: code, game, rev: 0, version: 0, save: null, at: new Date(now), ...(gc && { gc }) });
      return true;
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) return false;
      throw err;
    }
  }

  async byGc(gc: string): Promise<string | null> {
    return (await this.slots.findOne({ gc }, { projection: { _id: 1 } }))?._id ?? null;
  }

  async read(code: string): Promise<Slot | null> {
    const d = await this.slots.findOne({ _id: code });
    return d ? { game: d.game, rev: d.rev, version: d.version, save: d.save } : null;
  }

  async write(code: string, base: number, version: number, save: string, now: number): Promise<WriteOutcome> {
    const r = await this.slots.updateOne(
      { _id: code, rev: base, version: { $lte: version } },
      { $set: { version, save, at: new Date(now) }, $inc: { rev: 1 } },
    );
    if (r.matchedCount === 1) return 'ok';
    return (await this.slots.countDocuments({ _id: code }, { limit: 1 })) ? 'stale' : 'none';
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
