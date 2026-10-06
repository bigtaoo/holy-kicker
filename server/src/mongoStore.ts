import { MongoClient, type Collection, type Db } from 'mongodb';
import { boardId, runScore, type BoardReply, type EventBatch, type PropValue, type Report, type ReportSummary, type RunEntry } from './protocol';
import { dayOf } from './rules';
import { reportId, rowOf, summaryOf, type Stats, type Store } from './store';

// The MongoDB Atlas store (the cluster daydayup uses, its own database and user; server/README.md).
// Collections:
//   events   every analytics event, dropped after EVENTS_DAYS by a TTL index
//   installs one per install: the day it was first seen (for new players and retention)
//   active   one per install per day it sent anything
//   best     one per install per board: its best run
//   reports  problem reports with their replays, dropped after REPORTS_DAYS

const EVENTS_DAYS = 90;
const REPORTS_DAYS = 180;
const DAY_MS = 86_400_000;

interface EventDoc {
  at: Date;
  day: string;
  install: string;
  session: string;
  host: string;
  build: string;
  locale: string;
  e: string;
  t: Date;
  p: Record<string, PropValue>;
}

interface ReportDoc extends Report {
  _id: string;
  at: Date;
}

interface BestDoc {
  _id: string;
  board: string;
  tag: string;
  score: number;
  run: RunEntry;
  at: number;
}

export class MongoStore implements Store {
  private constructor(
    private readonly client: MongoClient,
    private readonly events: Collection<EventDoc>,
    private readonly installs: Collection<{ _id: string; first: string; host: string }>,
    private readonly active: Collection<{ _id: string; day: string; install: string }>,
    private readonly best: Collection<BestDoc>,
    private readonly reportDocs: Collection<ReportDoc>,
  ) {}

  static async open(uri: string, dbName: string): Promise<MongoStore> {
    const client = new MongoClient(uri, { maxPoolSize: 10, appName: 'holykicker' });
    await client.connect();
    const db: Db = client.db(dbName);
    const s = new MongoStore(client, db.collection('events'), db.collection('installs'), db.collection('active'), db.collection('best'), db.collection('reports'));
    await Promise.all([
      s.events.createIndex({ at: 1 }, { expireAfterSeconds: EVENTS_DAYS * 86_400 }),
      s.events.createIndex({ e: 1, day: 1 }),
      s.installs.createIndex({ first: 1 }),
      s.active.createIndex({ day: 1 }),
      s.best.createIndex({ board: 1, score: -1, at: 1 }),
      s.reportDocs.createIndex({ at: 1 }, { expireAfterSeconds: REPORTS_DAYS * 86_400 }),
    ]);
    return s;
  }

  async addEvents(b: EventBatch, now: number): Promise<void> {
    const at = new Date(now);
    const day = dayOf(now);
    await this.events.insertMany(
      b.events.map((e) => ({ at, day, install: b.install, session: b.session, host: b.host, build: b.build, locale: b.locale, e: e.e, t: new Date(e.t), p: e.p ?? {} })),
      { ordered: false },
    );
    await Promise.all([
      this.installs.updateOne({ _id: b.install }, { $setOnInsert: { first: day, host: b.host } }, { upsert: true }),
      this.active.updateOne({ _id: `${day}/${b.install}` }, { $setOnInsert: { day, install: b.install } }, { upsert: true }),
    ]);
  }

  private async rankOf(doc: BestDoc): Promise<number> {
    const ahead = await this.best.countDocuments({ board: doc.board, $or: [{ score: { $gt: doc.score } }, { score: doc.score, at: { $lt: doc.at } }] });
    return ahead + 1;
  }

  async submitRun(run: RunEntry, tag: string, now: number) {
    const board = boardId(run.chapter, run.hard);
    const _id = `${board}/${tag}`;
    const score = runScore(run);
    const old = await this.best.findOne({ _id });
    const best = !old || score > old.score;
    const doc: BestDoc = best ? { _id, board, tag, score, run, at: now } : old!;
    if (best) await this.best.replaceOne({ _id }, doc, { upsert: true });
    return { board, rank: await this.rankOf(doc), best };
  }

  async board(board: string, limit: number, tag: string | null): Promise<BoardReply> {
    const [top, total, own] = await Promise.all([
      this.best.find({ board }).sort({ score: -1, at: 1 }).limit(limit).toArray(),
      this.best.countDocuments({ board }),
      tag ? this.best.findOne({ _id: `${board}/${tag}` }) : null,
    ]);
    return { board, total, rows: top.map((b, k) => rowOf(b, k + 1)), mine: own ? rowOf(own, await this.rankOf(own)) : null };
  }

  async stats(days: number, now: number): Promise<Stats> {
    const list = Array.from({ length: days }, (_, i) => dayOf(now - (days - 1 - i) * DAY_MS));
    const from = list[0];
    const [active, fresh, runs, ends] = await Promise.all([
      this.active.aggregate<{ _id: string; n: number }>([{ $match: { day: { $gte: from } } }, { $group: { _id: '$day', n: { $sum: 1 } } }]).toArray(),
      this.installs.aggregate<{ _id: string; n: number }>([{ $match: { first: { $gte: from } } }, { $group: { _id: '$first', n: { $sum: 1 } } }]).toArray(),
      this.events.aggregate<{ _id: string; n: number }>([{ $match: { e: 'run_start', day: { $gte: from } } }, { $group: { _id: '$day', n: { $sum: 1 } } }]).toArray(),
      this.events.find({ e: 'run_end', day: { $gte: from } }, { projection: { day: 1, p: 1 } }).toArray(),
    ]);
    const count = (rows: { _id: string; n: number }[], day: string) => rows.find((r) => r._id === day)?.n ?? 0;
    const boards = new Map<string, { runs: number; won: number; lost: number[] }>();
    for (const e of ends) {
      const b = boardId(Number(e.p.chapter) || 0, e.p.hard === true);
      const row = boards.get(b) ?? { runs: 0, won: 0, lost: [] };
      row.runs++;
      if (e.p.won === true) row.won++;
      else row.lost.push(Number(e.p.wave) || 0);
      boards.set(b, row);
    }
    return {
      days: list.map((day) => ({ day, active: count(active, day), fresh: count(fresh, day), runs: count(runs, day), ended: ends.filter((e) => e.day === day).length })),
      boards: [...boards].sort(([a], [b]) => a.localeCompare(b)).map(([board, r]) => ({ board, runs: r.runs, won: r.won, medianLostWave: median(r.lost) })),
      retention: await this.retention(list),
    };
  }

  /** For each day, the installs first seen then and how many came back a day and a week later. */
  private async retention(list: string[]): Promise<Stats['retention']> {
    const newcomers = await this.installs.find({ first: { $gte: list[0] } }, { projection: { first: 1 } }).toArray();
    const seen = await this.active.find({ day: { $gte: list[0] } }, { projection: { _id: 1 } }).toArray();
    const back = new Set(seen.map((a) => a._id));
    const later = (day: string, n: number) => dayOf(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
    return list.map((day) => {
      const ids = newcomers.filter((i) => i.first === day).map((i) => i._id);
      const share = (n: number) => (ids.length ? Math.round((100 * ids.filter((id) => back.has(`${later(day, n)}/${id}`)).length) / ids.length) : 0);
      return { day, fresh: ids.length, d1: share(1), d7: share(7) };
    });
  }

  async addReport(report: Report, now: number): Promise<string> {
    const _id = reportId();
    await this.reportDocs.insertOne({ ...report, _id, at: new Date(now) });
    return _id;
  }

  async reports(limit: number): Promise<ReportSummary[]> {
    const docs = await this.reportDocs.find({}, { projection: { 'replay.cmds': 0, 'replay.config': 0 } }).sort({ at: -1 }).limit(limit).toArray();
    return docs.map(({ _id, at, ...r }) => summaryOf(r, _id, at.getTime()));
  }

  async report(id: string) {
    const doc = await this.reportDocs.findOne({ _id: id });
    if (!doc) return null;
    const { _id, at, ...r } = doc;
    return { ...r, id: _id, at: at.getTime() };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
