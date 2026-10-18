import { Resim, type Verdict } from './resim';
import { jobOf, type ResimJob as Job } from './challengeDocs';
import type { Store } from './store';

// The re-simulation queue: challenge runs kept pending wait here and are stepped one at a time,
// a slice of ticks per turn of the event loop, so the server keeps answering while a long run
// replays. A verdict settles the run in the store; a mismatch is also kept as a problem report
// with the replay, for the operator (it may be a determinism bug, not a cheat). The queue lives
// in the process: after a restart, start() queues the store's pending runs again.

/** Ticks stepped per turn (a few milliseconds of simulation). */
export const SLICE_TICKS = 300;

export class ResimQueue {
  private readonly jobs: Job[] = [];
  private running = false;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly store: Store,
    private readonly engineVersion: number,
    private readonly now: () => number,
    private readonly log: (line: string) => void = () => {},
    private readonly later: (fn: () => void) => void = setImmediate,
  ) {}

  /** Queues the runs the store still has pending (call once at startup). */
  async start(): Promise<void> {
    for (const d of await this.store.pendingChallengeRuns()) {
      const job = jobOf(d);
      if (job) this.push(job);
    }
  }

  push(job: Job): void {
    this.jobs.push(job);
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
    const job = this.jobs.shift();
    if (!job) {
      this.running = false;
      for (const w of this.waiters.splice(0)) w();
      return;
    }
    this.running = true;
    const resim = new Resim(job.replay, job.run, this.engineVersion);
    const turn = () => {
      const v = resim.step(SLICE_TICKS);
      if (!v) return this.later(turn);
      void this.settle(job, v).finally(() => this.next());
    };
    this.later(turn);
  }

  private async settle(job: Job, v: Verdict): Promise<void> {
    try {
      await this.store.settleChallengeRun(job.board, job.tag, job.at, v.ok ? v.picks : null);
      if (v.ok) return;
      this.log(`challenge run refused on ${job.board}: ${v.why}`);
      const r = job.run;
      await this.store.addReport({
        install: r.install, host: r.host, build: r.build, locale: '', text: `challenge ${job.challenge}: re-simulation refused the run (${v.why})`,
        device: 'server re-simulation', chapter: r.chapter, wave: r.wave, replay: job.replay,
      }, this.now());
    } catch (err) {
      this.log(`challenge settle failed on ${job.board}: ${err}`);
    }
  }
}
