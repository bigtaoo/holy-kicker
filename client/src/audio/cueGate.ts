import { CUES, type Cue } from './cues';

// Which cues sound this frame. Requests are collected through the frame and released once:
// the same cue asked for many times is one play with a count (a louder cue, never a stack of
// copies), and a cue still inside its gap since it last sounded is dropped. Pure: the caller
// passes its clock.

export class CueGate {
  private readonly pending = new Map<Cue, number>();
  private readonly last = new Map<Cue, number>();

  add(cue: Cue): void {
    this.pending.set(cue, (this.pending.get(cue) ?? 0) + 1);
  }

  /** The cues to play at `now` (seconds), highest priority first, each with its count. */
  flush(now: number): { cue: Cue; count: number }[] {
    const out: { cue: Cue; count: number }[] = [];
    for (const [cue, count] of this.pending) {
      const last = this.last.get(cue);
      if (last !== undefined && now - last < CUES[cue].gap) continue;
      this.last.set(cue, now);
      out.push({ cue, count });
    }
    this.pending.clear();
    return out.sort((a, b) => CUES[b.cue].priority - CUES[a.cue].priority);
  }

  /** Forgets pending requests (sound off, the tab hidden): nothing stale plays later. */
  clear(): void {
    this.pending.clear();
  }
}

/** The gain multiplier for `count` requests merged into one play: log-shaped and capped,
 *  since ten hits at once are a heavier moment, not ten times louder. */
export function coalesceBoost(count: number): number {
  return count <= 1 ? 1 : Math.min(1 + 0.15 * Math.log2(count), 1.5);
}
