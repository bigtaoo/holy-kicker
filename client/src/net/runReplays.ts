import { takeReplay, type Engine, type LocalInputSource } from '@hk/engine';
import { LIMITS, type ReplayEnd } from '@hk/protocol';
import type { Backend } from './backend';
import { newId } from './events';

// Collected run replays (server/src/replayShelf.ts): while the server collects them from this
// install, a real run's replay goes at its end, and the run so far whenever the game goes to the
// background mid-run, since the player may never come back (a later send of the same run replaces
// it there). Runs bent by a dev switch, the sandbox, and runs resumed from a snapshot (whose first
// ticks are not in the input history) are not sent.

/** Ticks a run must have gone on since its last send before the background sends it again. */
const RESEND_TICKS = 30 * 30;

/** The part of a Game this reads. */
export interface ReplaySource {
  readonly engine: Engine;
  readonly resumed: boolean;
}

type Net = Pick<Backend, 'replaysWanted' | 'sendReplay' | 'onHidden'>;

export class RunReplays {
  private source: ReplaySource | null = null;
  private run = '';
  private sentTick = -RESEND_TICKS;

  constructor(
    private readonly net: Net,
    private readonly random = Math.random,
  ) {
    net.onHidden(() => void this.send('hidden'));
  }

  /** A run begins; `real`: no dev switch bent it. Asks the server early, so the answer is in by the first send. */
  begin(source: ReplaySource, real: boolean): void {
    const ok = real && !source.resumed && source.engine.state.config.waves > 0;
    this.source = ok ? source : null;
    this.run = newId(this.random);
    this.sentTick = -RESEND_TICKS;
    if (ok) void this.net.replaysWanted();
  }

  /** The run ended: won, lost, or given up. */
  end(): Promise<void> {
    const s = this.source?.engine.state;
    const sent = s ? this.send(s.outcome === 'won' ? 'won' : s.outcome === 'lost' ? 'lost' : 'quit') : Promise.resolve();
    this.source = null;
    return sent;
  }

  private async send(end: ReplayEnd): Promise<void> {
    const src = this.source;
    if (!src) return;
    const engine = src.engine;
    if (end === 'hidden' && engine.state.tick - this.sentTick < RESEND_TICKS) return;
    // taken now: the run goes on (or is gone) by the time the answer comes
    const replay = takeReplay(engine, (engine.input as LocalInputSource).history, 1);
    if (replay.cmds.length > LIMITS.replayNumbers) return;
    this.sentTick = engine.state.tick;
    const run = this.run;
    if (await this.net.replaysWanted()) await this.net.sendReplay(run, end, { ...replay, config: { ...replay.config } });
  }
}
