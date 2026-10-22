import { MongoBulkWriteError, MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';
import type { Audience } from './audience';
import { counted, dayAfter, dayOffset, emptyDayZero, foldDayZero, foldProgress, type Player } from './players';
import { challengeUpdate, freshDoc, settleDoc, standing, topRuns, waiting } from './challengeDocs';
import { boardStanding, boardUpdate, newBest, settleBoardDoc, type BoardDoc } from './boardDocs';
import { RESIM_TOP, WATCH_TOP, boardId, keptGame, type Beacon, type BoardName, type BoardReply, type ChallengeBoardReply, type EventBatch, type Game, type PickWire, type Host, type PropValue, type ReplayWire, type Report, type ReportSummary, type RunEntry } from './protocol';
import { anomalyKey, sessionDevice, type AnomalyCount, type PerfSnap } from './perf';
import { dayOf } from './rules';
import { StatsFold, windowOf, type BeaconCount, type DayCounts, type EndCount, type Stats } from './stats';
import { PRUNED_EVENTS, pruneDue, pruneKeepFrom, reportId, rowOf, runName, summaryOf, resimLoad, resimRefs, type ChallengeDoc, type ChallengeEntry, type ResimLoad, type ResimRef, type RunTaken, type Store } from './store';

// The MongoDB Atlas store (the cluster daydayup uses, its own database and user; server/README.md).
// Collections:
//   events   every analytics event, dropped after EVENTS_DAYS by a TTL index
//   installs one per install (players.ts): the day it was first seen, the days it came back,
//            what it did on day 0 (new players, retention and its drivers) and its way to each
//            board's first clear
//   active   one per install per day it sent anything (daily actives)
//   best     one per install per board (boardDocs.ts BoardDoc): its best shown run; a new best
//            waits with its replay, pending or beside it in `next`, until re-simulated
//   challenge one per install per challenge board (challengeDocs.ts ChallengeDoc): pending with
//            its replay until re-simulated, then entered with its pick timeline; a weekly row
//            keeps the install's best, a better run waiting for its check in `next`
//   names    one per install that has a name, by its tag: a portal account's name or a dice name
//   reports  problem reports with their replays, dropped after REPORTS_DAYS
//   beacons  anonymous load checkpoints, one counter per day, host, build, step and game
// Holy Kicker and its corgi reskin share them (game.ts): a document of the corgi's carries
// `game: 'corgi'`, Holy Kicker's carry none (as everything from before the corgi), and the corgi's
// boards have ids of their own (`c3-corgi`).
//   meta     bookkeeping: `prune`, when perf and anomaly events were last pruned (store.ts prune)

const EVENTS_DAYS = 90;
const REPORTS_DAYS = 180;

interface EventDoc {
  /** `session/n` for a numbered event (ClientEvent.n), so a batch sent twice is kept once. */
  _id?: string | ObjectId;
  at: Date;
  day: string;
  install: string;
  session: string;
  host: string;
  build: string;
  locale: string;
  game?: Game;
  e: string;
  t: Date;
  p: Record<string, PropValue>;
}

interface ReportDoc extends Report {
  _id: string;
  at: Date;
}

interface ChallengeRow extends ChallengeDoc {
  _id: string;
}

type BestDoc = BoardDoc & { _id: string };

/** A board row's shown run only: no pending row, no replay. */
const SHOWN = { state: { $ne: 'pending' as const } };
const NO_REPLAY = { projection: { replay: 0, 'next.replay': 0 } };
/** What finds the rows with a run waiting, in either collection. */
const WAITING = { $or: [{ state: 'pending' as const }, { 'next.at': { $exists: true } }] };
/** A row as a replacement for itself (Mongo keeps the `_id`). */
const withoutId = <T extends object>(d: T): Omit<T, '_id'> => {
  const { _id: _, ...rest } = d as T & { _id?: unknown };
  return rest;
};
const REF = { projection: { board: 1, tag: 1, at: 1, state: 1, 'next.at': 1 } };

export class MongoStore implements Store {
  private constructor(
    private readonly client: MongoClient,
    private readonly events: Collection<EventDoc>,
    private readonly installs: Collection<Player>,
    private readonly active: Collection<{ _id: string; day: string; install: string; host: Host; game?: Game }>,
    private readonly best: Collection<BestDoc>,
    private readonly reportDocs: Collection<ReportDoc>,
    private readonly names: Collection<{ _id: string; name?: string; dice?: number; at: Date }>,
    private readonly beacons: Collection<{ _id: string; day: string; host: string; build: string; step: string; game?: Game; n: number; t?: Record<string, number> }>,
    private readonly meta: Collection<{ _id: string; at: Date }>,
    private readonly challenges: Collection<ChallengeRow>,
  ) {}

  static async open(uri: string, dbName: string): Promise<MongoStore> {
    const client = new MongoClient(uri, { maxPoolSize: 10, appName: 'holykicker' });
    await client.connect();
    const db: Db = client.db(dbName);
    const s = new MongoStore(client, db.collection('events'), db.collection('installs'), db.collection('active'), db.collection('best'), db.collection('reports'), db.collection('names'), db.collection('beacons'), db.collection('meta'), db.collection('challenge'));
    await Promise.all([
      s.events.createIndex({ at: 1 }, { expireAfterSeconds: EVENTS_DAYS * 86_400 }),
      s.events.createIndex({ e: 1, day: 1 }),
      s.installs.createIndex({ first: 1 }),
      s.active.createIndex({ day: 1 }),
      s.active.createIndex({ install: 1 }),
      s.best.createIndex({ board: 1, score: -1, at: 1 }),
      s.best.createIndex({ state: 1 }, { sparse: true }),
      s.best.createIndex({ 'next.at': 1 }, { sparse: true }),
      s.challenges.createIndex({ board: 1, state: 1, score: -1, at: 1 }),
      s.challenges.createIndex({ state: 1 }),
      s.challenges.createIndex({ 'next.at': 1 }, { sparse: true }),
      s.beacons.createIndex({ day: 1 }),
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

  async addEvents(sent: EventBatch, now: number, aud?: Audience): Promise<void> {
    const at = new Date(now);
    const day = dayOf(now);
    const game = sent.game ? { game: sent.game } : {};
    const docs = sent.events.map((e): EventDoc => ({
      ...(e.n !== undefined ? { _id: `${sent.session}/${e.n}` } : {}),
      at, day, install: sent.install, session: sent.session, host: sent.host, build: sent.build, locale: sent.locale, ...game, e: e.e, t: new Date(e.t), p: e.p ?? {},
    }));
    const dupes = new Set<number>();
    try {
      await this.events.insertMany(docs, { ordered: false });
    } catch (err) {
      // events already kept (a batch sent again after its reply was lost) are skipped, and only
      // the new ones are counted below; any other failure is a real one
      if (!(err instanceof MongoBulkWriteError)) throw err;
      const errors = Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
      if (errors.some((w) => w.code !== 11000)) throw err;
      for (const w of errors) dupes.add(w.index);
    }
    const b = { ...sent, events: sent.events.filter((_, i) => !dupes.has(i)) };
    if (b.events.length === 0) return;
    const [p, seen] = await Promise.all([
      this.installs.findOneAndUpdate({ _id: b.install }, { $setOnInsert: { first: day, host: b.host, ...game, build: b.build, ...(aud ? { aud } : {}), back: [], d0: emptyDayZero() } }, { upsert: true, returnDocument: 'after' }),
      this.active.updateOne({ _id: `${day}/${b.install}` }, { $setOnInsert: { day, install: b.install, host: b.host, ...game } }, { upsert: true }),
    ]);
    if (!p) return;
    const offset = dayOffset(p.first, day);
    const fresh = seen.upsertedCount === 1 && counted(offset);
    const ran = b.events.some((e) => e.e === 'run_end');
    if (p.first !== day && !fresh && !ran) return;
    const set = { ...(p.first === day ? { d0: foldDayZero(p.d0, b.events) } : {}), ...(ran ? { progress: foldProgress(p.progress, b.events, offset) } : {}) };
    await this.installs.updateOne({ _id: b.install }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(fresh ? { $addToSet: { back: offset } } : {}) });
  }

  async beacon(host: Host, step: Beacon, build: string, now: number, bucket: string | null, game?: Game): Promise<void> {
    const day = dayOf(now);
    const g = keptGame(game);
    await this.beacons.updateOne({ _id: `${day}/${host}/${build}/${step}${g ? `/${g}` : ''}` }, { $setOnInsert: { day, host, build, step, ...(g ? { game: g } : {}) }, $inc: { n: 1, ...(bucket ? { [`t.${bucket}`]: 1 } : {}) } }, { upsert: true });
  }

  /** Where `doc` places among its board's shown rows, the install's own row aside. */
  private async rankOf(doc: Omit<BestDoc, '_id'>): Promise<number> {
    const ahead = await this.best.countDocuments({ board: doc.board, ...SHOWN, tag: { $ne: doc.tag }, $or: [{ score: { $gt: doc.score } }, { score: doc.score, at: { $lt: doc.at } }] });
    return ahead + 1;
  }

  async submitRun(run: RunEntry, tag: string, replay: ReplayWire | null, now: number): Promise<RunTaken> {
    const board = boardId(run.chapter, run.hard, run.game);
    const _id = `${board}/${tag}`;
    const old = await this.best.findOne({ _id }, NO_REPLAY);
    const b = newBest(board, tag, run, now);
    let doc = boardUpdate(old, b, replay);
    if (typeof doc !== 'string') {
      // two sends at once: the first write wins, the other is told it was no better
      const won = old
        ? (await this.best.replaceOne({ _id, at: old.at, 'next.at': old.next?.at ?? null }, withoutId(doc))).matchedCount > 0
        : (await this.best.updateOne({ _id }, { $setOnInsert: { ...doc, _id } }, { upsert: true })).upsertedCount > 0;
      if (!won) doc = 'lower';
    }
    const name = runName(run);
    if (name) await this.setName(tag, name, now);
    const rank = await this.rankOf(doc === 'lower' && old ? boardStanding(old) : b);
    return { board, rank, best: doc !== 'lower', status: typeof doc === 'string' ? doc : 'pending', at: now };
  }

  async settleBoardRun(board: string, tag: string, at: number, ok: boolean): Promise<void> {
    const _id = `${board}/${tag}`;
    const doc = await this.best.findOne({ _id }, NO_REPLAY);
    const next = doc && settleBoardDoc(doc, at, ok);
    if (!doc || next === undefined) return;
    // only while the row still holds what was checked
    const same = { _id, at: doc.at, 'next.at': doc.next?.at ?? null };
    if (next === null) await this.best.deleteOne(same);
    else await this.best.replaceOne(same, withoutId(next));
  }

  async pendingResims(): Promise<ResimRef[]> {
    const [challenges, boards] = await Promise.all([this.challenges.find(WAITING, REF).toArray(), this.best.find(WAITING, REF).toArray()]);
    return resimRefs(challenges, boards);
  }

  async resimJob(ref: ResimRef): Promise<ResimLoad | null> {
    const _id = `${ref.board}/${ref.tag}`;
    return resimLoad(ref, ref.kind === 'challenge' ? await this.challenges.findOne({ _id }) : await this.best.findOne({ _id }));
  }

  async board(board: string, limit: number, tag: string | null): Promise<BoardReply> {
    const [top, total, own] = await Promise.all([
      this.best.find({ board, ...SHOWN }, NO_REPLAY).sort({ score: -1, at: 1 }).limit(limit).toArray(),
      this.best.countDocuments({ board, ...SHOWN }),
      tag ? this.best.findOne({ _id: `${board}/${tag}`, ...SHOWN }, NO_REPLAY) : null,
    ]);
    const tags = [...new Set([...top.map((b) => b.tag), ...(own ? [own.tag] : [])])];
    const docs = await this.names.find({ _id: { $in: tags } }).toArray();
    const names = new Map(docs.map((n): [string, BoardName] => [n._id, n.name ? { name: n.name } : { dice: n.dice ?? 0 }]));
    return { board, total, rows: top.map((b, k) => rowOf(b, k + 1, names)), mine: own ? rowOf(own, await this.rankOf(own), names) : null };
  }

  private async place(doc: ChallengeDoc): Promise<{ rank: number; total: number }> {
    const entered = { board: doc.board, state: 'entered' as const };
    const [above, n] = await Promise.all([
      this.challenges.countDocuments({ ...entered, $or: [{ score: { $gt: doc.score } }, { score: doc.score, at: { $lt: doc.at } }] }),
      this.challenges.countDocuments(entered),
    ]);
    return { rank: above + 1, total: n + (doc.state === 'pending' ? 1 : 0) };
  }

  async challengeRun(e: ChallengeEntry, now: number) {
    const _id = `${e.board}/${e.tag}`;
    const old = await this.challenges.findOne({ _id });
    const doc = challengeUpdate(old, e, now, (await this.place(freshDoc(e, now))).rank <= RESIM_TOP);
    if (typeof doc === 'string') return { board: e.board, status: doc, ...(await this.place(standing(old!))) };
    // two sends at once: the first write wins, the other is told it was no better
    const won = old
      ? (await this.challenges.replaceOne({ _id, at: old.at, 'next.at': old.next?.at ?? null }, doc)).matchedCount > 0
      : (await this.challenges.updateOne({ _id }, { $setOnInsert: { ...doc, _id } }, { upsert: true })).upsertedCount > 0;
    const name = runName(e.run);
    if (name) await this.setName(e.tag, name, now);
    if (!won) return { board: e.board, status: old ? ('lower' as const) : ('repeat' as const), ...(await this.place(standing(doc))) };
    return { board: e.board, status: waiting(doc) ? ('pending' as const) : ('ranked' as const), ...(await this.place(standing(doc))) };
  }

  async settleChallengeRun(board: string, tag: string, at: number, picks: PickWire[] | null): Promise<void> {
    const _id = `${board}/${tag}`;
    const doc = await this.challenges.findOne({ _id });
    const next = doc && settleDoc(doc, at, picks);
    if (!doc || next === undefined) return;
    // only while the row still holds what was checked
    const same = { _id, at: doc.at, 'next.at': doc.next?.at ?? null };
    if (next === null) await this.challenges.deleteOne(same);
    else await this.challenges.replaceOne(same, next);
  }

  async challengeBoard(board: string, limit: number, tag: string | null): Promise<ChallengeBoardReply> {
    const noBulk = { projection: { replay: 0, picks: 0, next: 0 } };
    const [top, own, best] = await Promise.all([
      this.challenges.find({ board, state: 'entered' }, noBulk).sort({ score: -1, at: 1 }).limit(limit).toArray(),
      tag ? this.challenges.findOne({ _id: `${board}/${tag}` }, { projection: { replay: 0, picks: 0, 'next.replay': 0 } }) : null,
      // the weekly's top runs publish their pick timeline and whether their replay is kept
      board.startsWith('w') ? this.challenges.find({ board, state: 'entered' }, { projection: { next: 0, 'replay.cmds': 0 } }).sort({ score: -1, at: 1 }).limit(WATCH_TOP).toArray() : [],
    ]);
    const tags = [...new Set([...top.map((b) => b.tag), ...(own ? [own.tag] : [])])];
    const docs = await this.names.find({ _id: { $in: tags } }).toArray();
    const names = new Map(docs.map((n): [string, BoardName] => [n._id, n.name ? { name: n.name } : { dice: n.dice ?? 0 }]));
    const placed = own ? await this.place(own) : { rank: 0, total: await this.challenges.countDocuments({ board, state: 'entered' }) };
    return { board, total: placed.total, rows: top.map((b, k) => rowOf(b, k + 1, names)), mine: own ? rowOf(own, placed.rank, names) : null, pending: own ? waiting(own) : false, top: topRuns(board, best) };
  }

  async challengeReplay(board: string, tag: string): Promise<ReplayWire | null> {
    const doc = await this.challenges.findOne({ _id: `${board}/${tag}`, state: 'entered', verified: true }, { projection: { next: 0, picks: 0 } });
    if (!doc?.replay) return null;
    return (await this.place(doc)).rank <= WATCH_TOP ? doc.replay : null;
  }

  async weekRanks(week: string): Promise<string[][]> {
    const rows = await this.challenges
      .find({ board: { $regex: `^${week}-` }, state: 'entered' }, { projection: { board: 1, tag: 1 } })
      .sort({ board: 1, score: -1, at: 1 })
      .toArray();
    const boards = new Map<string, string[]>();
    for (const r of rows) boards.set(r.board, [...(boards.get(r.board) ?? []), r.tag]);
    return [...boards.values()];
  }

  async setName(tag: string, name: BoardName, now: number): Promise<void> {
    // replaced whole, so a dice name drops a portal name kept before and the other way round
    await this.names.replaceOne({ _id: tag }, { ...name, at: new Date(now) }, { upsert: true });
  }

  async stats(days: number, now: number, host: Host | null, to?: string, game: Game = 'monk'): Promise<Stats> {
    const today = dayOf(now);
    const list = windowOf(days, today, to);
    const window = { $gte: list[0], $lte: list[list.length - 1] };
    // the first game's documents carry no `game` (game.ts keptGame)
    const g = keptGame(game);
    const mine = { ...(host ? { host } : {}), game: g ?? { $exists: false } };
    const fold = new StatsFold(list, today);
    // one small document per new install, streamed: memory stays flat however many there are
    for await (const p of this.installs.find({ first: window, ...mine }, { projection: { first: 1, build: 1, aud: 1, back: 1, d0: 1, progress: 1 } })) fold.add(p);
    type Count = { _id: string; n: number };
    type Outcome = { _id: { chapter: unknown; hard: unknown; won: unknown; gaveUp: unknown; wave: unknown }; n: number };
    type Trouble = { _id: { day: string; build: string; kind: unknown; msg: unknown; src: unknown; level: unknown }; n: number };
    const [active, runs, [ends], beacons, perfDocs, trouble] = await Promise.all([
      this.active.aggregate<Count>([{ $match: { day: window, ...mine } }, { $group: { _id: '$day', n: { $sum: 1 } } }]).toArray(),
      this.events.aggregate<Count>([{ $match: { e: 'run_start', day: window, ...mine } }, { $group: { _id: '$day', n: { $sum: 1 } } }]).toArray(),
      this.events.aggregate<{ days: Count[]; outcomes: Outcome[] }>([
        { $match: { e: 'run_end', day: window, ...mine } },
        {
          $facet: {
            days: [{ $group: { _id: '$day', n: { $sum: 1 } } }],
            outcomes: [{ $group: { _id: { chapter: '$p.chapter', hard: '$p.hard', won: '$p.won', gaveUp: '$p.gaveUp', wave: '$p.wave' }, n: { $sum: 1 } } }],
          },
        },
      ]).toArray(),
      this.beacons.find({ day: window, ...mine }).toArray(),
      this.events.find({ e: 'perf', day: window, ...mine }, { projection: { _id: 0, day: 1, host: 1, build: 1, install: 1, session: 1, p: 1 } }).toArray(),
      this.events.aggregate<Trouble>([
        { $match: { e: 'anomaly', day: window, ...mine } },
        { $group: { _id: { day: '$day', build: '$build', kind: '$p.kind', msg: '$p.msg', src: '$p.src', level: '$p.level' }, n: { $sum: 1 } } },
      ]).toArray(),
    ]);
    const map = (rows: Count[]) => new Map(rows.map((r) => [r._id, r.n]));
    const counts: DayCounts = { active: map(active), runs: map(runs), ended: map(ends?.days ?? []) };
    const outcomes: EndCount[] = (ends?.outcomes ?? []).map(({ _id: o, n }) => ({ chapter: Number(o.chapter) || 0, hard: o.hard === true, won: o.won === true, gaveUp: o.gaveUp === true, wave: Number(o.wave) || 0, n }));
    const loads: BeaconCount[] = beacons.map(({ day, build, step, n, t }) => ({ day, build, step, n, ...(t ? { t } : {}) }));
    // the device and system are the sending install's, kept once on its first batch
    // and the GPU class, memory and cores the launch's `session` event (the same day, or the one before for a run past midnight)
    const ids = [...new Set(perfDocs.map((d) => d.install))];
    const sessions = [...new Set(perfDocs.map((d) => d.session))];
    const [installs, launches] = await Promise.all([
      this.installs.find({ _id: { $in: ids } }, { projection: { aud: 1 } }).toArray(),
      this.events.find({ e: 'session', day: { $gte: dayAfter(list[0], -1), $lte: list[list.length - 1] }, session: { $in: sessions } }, { projection: { _id: 0, session: 1, 'p.mem': 1, 'p.cores': 1, 'p.gpu': 1 } }).toArray(),
    ]);
    const auds = new Map(installs.map((p) => [p._id, p.aud]));
    const devices = new Map(launches.map((l) => [l.session, sessionDevice(l.p)]));
    const snaps: PerfSnap[] = perfDocs.map((d) => ({
      day: d.day, host: d.host, build: d.build, device: auds.get(d.install)?.device ?? 'unknown', os: auds.get(d.install)?.os ?? 'unknown', ...(devices.get(d.session) ?? sessionDevice(undefined)), p: d.p ?? {},
    }));
    const anomalies: AnomalyCount[] = trouble.map(({ _id: { day, build, ...p }, n }) => ({ ...anomalyKey(day, build ?? 'unknown', p as Record<string, PropValue>), n }));
    return fold.result(host, game, counts, outcomes, loads, snaps, anomalies);
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

  async prune(now: number): Promise<number | null> {
    const last = await this.meta.findOne({ _id: 'prune' });
    if (!pruneDue(last ? last.at.getTime() : null, now)) return null;
    // by type and receive day, so the { e, day } index serves it; the 90-day TTL still covers the rest
    const { deletedCount } = await this.events.deleteMany({ e: { $in: [...PRUNED_EVENTS] }, day: { $lt: pruneKeepFrom(now) } });
    await this.meta.replaceOne({ _id: 'prune' }, { at: new Date(now) }, { upsert: true });
    return deletedCount;
  }

  async ping(): Promise<void> {
    await this.client.db('admin').command({ ping: 1 });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
