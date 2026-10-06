import { MongoClient, type Collection, type Db } from 'mongodb';
import { counted, dayOffset, emptyDayZero, foldDayZero, type Player } from './players';
import { boardId, runScore, type BoardName, type BoardReply, type EventBatch, type Host, type PropValue, type Report, type ReportSummary, type RunEntry } from './protocol';
import { dayOf } from './rules';
import { StatsFold, windowOf, type DayCounts, type EndCount, type Stats } from './stats';
import { reportId, rowOf, runName, summaryOf, type Store } from './store';

// The MongoDB Atlas store (the cluster daydayup uses, its own database and user; server/README.md).
// Collections:
//   events   every analytics event, dropped after EVENTS_DAYS by a TTL index
//   installs one per install (players.ts): the day it was first seen, the days it came back and
//            what it did on day 0 (new players, retention and its drivers)
//   active   one per install per day it sent anything (daily actives)
//   best     one per install per board: its best run
//   names    one per install that has a name, by its tag: a portal account's name or a dice name
//   reports  problem reports with their replays, dropped after REPORTS_DAYS

const EVENTS_DAYS = 90;
const REPORTS_DAYS = 180;

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
    private readonly installs: Collection<Player>,
    private readonly active: Collection<{ _id: string; day: string; install: string; host: Host }>,
    private readonly best: Collection<BestDoc>,
    private readonly reportDocs: Collection<ReportDoc>,
    private readonly names: Collection<{ _id: string; name?: string; dice?: number; at: Date }>,
  ) {}

  static async open(uri: string, dbName: string): Promise<MongoStore> {
    const client = new MongoClient(uri, { maxPoolSize: 10, appName: 'holykicker' });
    await client.connect();
    const db: Db = client.db(dbName);
    const s = new MongoStore(client, db.collection('events'), db.collection('installs'), db.collection('active'), db.collection('best'), db.collection('reports'), db.collection('names'));
    await Promise.all([
      s.events.createIndex({ at: 1 }, { expireAfterSeconds: EVENTS_DAYS * 86_400 }),
      s.events.createIndex({ e: 1, day: 1 }),
      s.installs.createIndex({ first: 1 }),
      s.active.createIndex({ day: 1 }),
      s.active.createIndex({ install: 1 }),
      s.best.createIndex({ board: 1, score: -1, at: 1 }),
      s.reportDocs.createIndex({ at: 1 }, { expireAfterSeconds: REPORTS_DAYS * 86_400 }),
    ]);
    await s.upgrade();
    return s;
  }

  /** Brings installs from before players.ts (no `back`) up to date, with their active days' host. */
  private async upgrade(): Promise<void> {
    for await (const p of this.installs.find({ back: { $exists: false } })) {
      const days = await this.active.find({ install: p._id }, { projection: { day: 1 } }).toArray();
      const back = [...new Set(days.map((a) => dayOffset(p.first, a.day)).filter(counted))];
      await this.installs.updateOne({ _id: p._id }, { $set: { back, d0: p.d0 ?? emptyDayZero(), host: p.host ?? 'web' } });
      await this.active.updateMany({ install: p._id, host: { $exists: false } }, { $set: { host: p.host ?? 'web' } });
    }
  }

  async addEvents(b: EventBatch, now: number): Promise<void> {
    const at = new Date(now);
    const day = dayOf(now);
    await this.events.insertMany(
      b.events.map((e) => ({ at, day, install: b.install, session: b.session, host: b.host, build: b.build, locale: b.locale, e: e.e, t: new Date(e.t), p: e.p ?? {} })),
      { ordered: false },
    );
    const [p, seen] = await Promise.all([
      this.installs.findOneAndUpdate({ _id: b.install }, { $setOnInsert: { first: day, host: b.host, build: b.build, back: [], d0: emptyDayZero() } }, { upsert: true, returnDocument: 'after' }),
      this.active.updateOne({ _id: `${day}/${b.install}` }, { $setOnInsert: { day, install: b.install, host: b.host } }, { upsert: true }),
    ]);
    if (!p) return;
    const offset = dayOffset(p.first, day);
    const fresh = seen.upsertedCount === 1 && counted(offset);
    if (p.first !== day && !fresh) return;
    await this.installs.updateOne(
      { _id: b.install },
      { ...(p.first === day ? { $set: { d0: foldDayZero(p.d0, b.events) } } : {}), ...(fresh ? { $addToSet: { back: offset } } : {}) },
    );
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
    const name = runName(run);
    if (name) await this.setName(tag, name, now);
    return { board, rank: await this.rankOf(doc), best };
  }

  async board(board: string, limit: number, tag: string | null): Promise<BoardReply> {
    const [top, total, own] = await Promise.all([
      this.best.find({ board }).sort({ score: -1, at: 1 }).limit(limit).toArray(),
      this.best.countDocuments({ board }),
      tag ? this.best.findOne({ _id: `${board}/${tag}` }) : null,
    ]);
    const tags = [...new Set([...top.map((b) => b.tag), ...(own ? [own.tag] : [])])];
    const docs = await this.names.find({ _id: { $in: tags } }).toArray();
    const names = new Map(docs.map((n): [string, BoardName] => [n._id, n.name ? { name: n.name } : { dice: n.dice ?? 0 }]));
    return { board, total, rows: top.map((b, k) => rowOf(b, k + 1, names)), mine: own ? rowOf(own, await this.rankOf(own), names) : null };
  }

  async setName(tag: string, name: BoardName, now: number): Promise<void> {
    // replaced whole, so a dice name drops a portal name kept before and the other way round
    await this.names.replaceOne({ _id: tag }, { ...name, at: new Date(now) }, { upsert: true });
  }

  async stats(days: number, now: number, host: Host | null): Promise<Stats> {
    const today = dayOf(now);
    const list = windowOf(days, today);
    const from = list[0];
    const mine = host ? { host } : {};
    const fold = new StatsFold(list, today);
    // one small document per new install, streamed: memory stays flat however many there are
    for await (const p of this.installs.find({ first: { $gte: from }, ...mine }, { projection: { first: 1, build: 1, back: 1, d0: 1 } })) fold.add(p);
    type Count = { _id: string; n: number };
    type Outcome = { _id: { chapter: unknown; hard: unknown; won: unknown; wave: unknown }; n: number };
    const [active, runs, [ends]] = await Promise.all([
      this.active.aggregate<Count>([{ $match: { day: { $gte: from }, ...mine } }, { $group: { _id: '$day', n: { $sum: 1 } } }]).toArray(),
      this.events.aggregate<Count>([{ $match: { e: 'run_start', day: { $gte: from }, ...mine } }, { $group: { _id: '$day', n: { $sum: 1 } } }]).toArray(),
      this.events.aggregate<{ days: Count[]; outcomes: Outcome[] }>([
        { $match: { e: 'run_end', day: { $gte: from }, ...mine } },
        {
          $facet: {
            days: [{ $group: { _id: '$day', n: { $sum: 1 } } }],
            outcomes: [{ $group: { _id: { chapter: '$p.chapter', hard: '$p.hard', won: '$p.won', wave: '$p.wave' }, n: { $sum: 1 } } }],
          },
        },
      ]).toArray(),
    ]);
    const map = (rows: Count[]) => new Map(rows.map((r) => [r._id, r.n]));
    const counts: DayCounts = { active: map(active), runs: map(runs), ended: map(ends?.days ?? []) };
    const outcomes: EndCount[] = (ends?.outcomes ?? []).map(({ _id: o, n }) => ({ chapter: Number(o.chapter) || 0, hard: o.hard === true, won: o.won === true, wave: Number(o.wave) || 0, n }));
    return fold.result(host, counts, outcomes);
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
