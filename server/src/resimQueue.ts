import type { Engines } from './engines';
import { Resim, chapterConfig, rankedConfig, type Verdict } from './resim';
import type { ResimLoad, ResimRef, Store } from './store';

// The re-simulation queue: challenge runs and chapter-board bests kept pending wait here and are
// stepped one at a time, a slice of ticks per turn of the event loop, so the server keeps
// answering while a long run replays. The queue holds only references: a run's replay is read
// from the store at its turn, so memory stays flat however many wait. A verdict settles the run
// in the store; a mismatch is also kept as a problem report with the replay, for the operator (it
// may be a determinism bug, not a cheat). A run with no engine here to check it on (engines.ts) is
// kept aside `stale` instead, neither deleted nor reported. The queue lives in the process: after
// a restart, start() queues the store's pending runs again.

/** Ticks stepped per turn (a few milliseconds of simulation). */
export const SLICE_TICKS = 300;

/** References queued at most; a run past it stays pending in the store until the next start(). */
export const QUEUE_CAP = 10_000;

export class ResimQueue {
  private readonly jobs: ResimRef[] = [];
  private running = false;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly store: Store,
    private readonly engines: Engines,
    private readonly now: () => number,
    private readonly log: (line: string) => void = () => {},
    private readonly later: (fn: () => void) => void = setImmediate,
  ) {}

  /** Queues the runs the store still has pending (call once at startup). */
  async start(): Promise<void> {
    for (const ref of await this.store.pendingResims()) this.push(ref);
  }

  push(ref: ResimRef): void {
    if (this.jobs.length >= QUEUE_CAP) return this.log(`resim queue full: ${ref.kind} ${ref.board} waits for a restart`);
    this.jobs.push(ref);
    if (!this.running) this.next();
  }

  get length(): number {
    return this.jobs.length + (this.running ? 1 : 0);
  }

  /** Resolves once the queue is empty (the tests). */
  idle(): Promise<void> {
    return this.length === 0 ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  private next(): void {
    const ref = this.jobs.shift();
    if (!ref) {
      this.running = false;
      for (const w of this.waiters.splice(0)) w();
      return;
    }
    this.running = true;
    void this.store.resimJob(ref).then(
      (job) => (job ? void this.run(ref, job) : this.next()),
      (err) => {
        this.log(`resim load failed on ${ref.board}: ${err}`);
        this.next();
      },
    );
  }

  private async run(ref: ResimRef, job: ResimLoad): Promise<void> {
    const engine = await this.engines(job.replay.engine);
    const resim = new Resim(job.replay, job.run, engine, ref.kind === 'challenge' ? rankedConfig : chapterConfig);
    const turn = () => {
      const v = resim.step(SLICE_TICKS);
      if (!v) return this.later(turn);
      void this.settle(ref, job, v).finally(() => this.next());
    };
    this.later(turn);
  }

  private async settle(ref: ResimRef, job: ResimLoad, v: Verdict): Promise<void> {
    const stale = !v.ok && v.why === 'engine';
    try {
      if (ref.kind === 'challenge') await this.store.settleChallengeRun(ref.board, ref.tag, ref.at, v.ok ? v.picks : stale ? 'stale' : null);
      else await this.store.settleBoardRun(ref.board, ref.tag, ref.at, stale ? 'stale' : v.ok);
      if (v.ok) return;
      if (stale) return this.log(`${ref.kind} run on ${ref.board} kept aside: no engine ${job.replay.engine} here`);
      this.log(`${ref.kind} run refused on ${ref.board}: ${v.why}`);
      const r = job.run;
      await this.store.addReport({
        install: r.install, host: r.host, build: r.build, locale: '', text: `${job.what}: re-simulation refused the run (${v.why})`,
        device: 'server re-simulation', chapter: r.chapter, wave: r.wave, replay: job.replay,
      }, this.now());
    } catch (err) {
      this.log(`${ref.kind} settle failed on ${ref.board}: ${err}`);
    }
  }
}
