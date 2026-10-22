// A frame that throws (Shell.fault): one bad frame must never leave a frozen canvas, nor a broken
// device flood the backend. Each fault says whether to report it (once per REPORT_GAP_MS; the
// anomaly cap bounds the session too) and what to do: recover (take the run or the screen down and
// put up a fresh one), wait (a recovery just ran, give its screen a moment), or, once recoveries
// stop helping (STRIKES of them inside STRIKE_MS), restart the page. Where it cannot restart (no
// reload on WeChat, or it restarted a moment ago and the fault came back), it rests for STRIKE_MS
// and then recovers again, so a fault hours later is still recovered and a fault on every frame
// never turns into a reload loop.

export const REPORT_GAP_MS = 30_000;
export const RECOVER_GAP_MS = 1_000;
export const STRIKES = 4;
export const STRIKE_MS = 20_000;
/** A restart this soon after the last one is not tried again (Shell keeps the time across the reload). */
export const RESTART_GAP_MS = 10 * 60_000;

export type FaultAction = 'recover' | 'wait' | 'restart';

export class FaultGuard {
  private reported = -Infinity;
  private recoveries: number[] = [];
  private restUntil = -Infinity;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly canRestart: () => boolean = () => true,
  ) {}

  fault(): { report: boolean; act: FaultAction } {
    const t = this.now();
    const report = t - this.reported >= REPORT_GAP_MS;
    if (report) this.reported = t;
    const last = this.recoveries[this.recoveries.length - 1] ?? -Infinity;
    if (t < this.restUntil || t - last < RECOVER_GAP_MS) return { report, act: 'wait' };
    this.recoveries = [...this.recoveries.filter((at) => t - at < STRIKE_MS), t];
    if (this.recoveries.length < STRIKES) return { report, act: 'recover' };
    this.recoveries = [];
    if (this.canRestart()) return { report, act: 'restart' };
    this.restUntil = t + STRIKE_MS;
    return { report, act: 'wait' };
  }
}
