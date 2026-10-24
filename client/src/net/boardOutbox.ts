import { boardId, runScore, type RunPost } from '@hk/protocol';
import { SafeStore, type KeyValueStore } from '../meta/saveStore';

// Board runs the server has not answered yet (offline, a timeout, the tab closed on the way): each
// board keeps its best such run with its replay on the device, and Backend sends it again until the
// server answers, whatever it says. Kept in the browser's own storage, never the host's (a portal's
// cloud data has no room for replays).

export const OUTBOX_KEY = 'hk.boardOutbox';
/** At most this many characters kept, about three full-chapter replays; the oldest runs go first. */
export const OUTBOX_CHARS = 1_500_000;

const boardOf = (r: RunPost) => boardId(r.chapter, r.hard, r.game);
const same = (a: RunPost, b: RunPost) => boardOf(a) === boardOf(b) && runScore(a) === runScore(b) && a.kills === b.kills;

export class BoardOutbox {
  constructor(private readonly store: KeyValueStore = new SafeStore(null)) {}

  /** The runs waiting, oldest first. */
  list(): RunPost[] {
    try {
      const list: unknown = JSON.parse(this.store.getItem(OUTBOX_KEY) ?? '[]');
      return Array.isArray(list) ? list.filter((r): r is RunPost => typeof r?.chapter === 'number' && typeof r.wave === 'number' && typeof r.tenths === 'number') : [];
    } catch {
      return [];
    }
  }

  /** Whether a run for `board` waits. */
  waiting(board: string): boolean {
    return this.list().some((r) => boardOf(r) === board);
  }

  /** Keeps `run` until the server answers it, unless one at least as good waits for its board. */
  put(run: RunPost): void {
    const list = this.list();
    const old = list.find((r) => boardOf(r) === boardOf(run));
    if (old && runScore(old) >= runScore(run)) return;
    const next = [...list.filter((r) => r !== old), run];
    while (next.length > 1 && JSON.stringify(next).length > OUTBOX_CHARS) next.shift();
    if (JSON.stringify(next).length <= OUTBOX_CHARS) this.write(next);
  }

  /** Drops `run` once the server answered it; a better one put since stays. */
  done(run: RunPost): void {
    const list = this.list();
    const next = list.filter((r) => !same(r, run));
    if (next.length !== list.length) this.write(next);
  }

  clear(): void {
    if (this.list().length) this.write([]);
  }

  private write(list: RunPost[]): void {
    this.store.setItem(OUTBOX_KEY, JSON.stringify(list));
  }
}
