import { WEEK_MS, weekIdOf } from './challenge';
import { weekTier, type BoardReply } from './protocol';
import type { Store } from './store';

// Last week's weekly challenge tiers (docs/design.md "Challenges" rewards), worn as a mark beside
// the name on every board this week: worked out from the closed week's boards when first asked
// for, and kept an hour (runs re-simulated late still join).

/** The best tier each tag reached on any of a week's boards (tags in rank order), for the tags that reached one. */
export function weekMarks(boards: readonly (readonly string[])[]): Map<string, number> {
  const marks = new Map<string, number>();
  for (const tags of boards) {
    tags.forEach((tag, k) => {
      const tier = weekTier(k + 1, tags.length);
      if (tier > (marks.get(tag) ?? 0)) marks.set(tag, tier);
    });
  }
  return marks;
}

/** A board reply with each row's mark. */
export function marked<T extends BoardReply>(reply: T, marks: ReadonlyMap<string, number>): T {
  const mark = <R extends { tag: string }>(r: R): R => (marks.has(r.tag) ? { ...r, mark: marks.get(r.tag) } : r);
  return { ...reply, rows: reply.rows.map(mark), mine: reply.mine && mark(reply.mine) };
}

const KEEP_MS = 3600_000;

export class WeekMarks {
  private kept: { week: string; at: number; marks: Map<string, number> } | null = null;

  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}

  /** The marks of the week before the current one. */
  async current(): Promise<Map<string, number>> {
    const t = this.now();
    const week = weekIdOf(t - WEEK_MS);
    if (this.kept?.week === week && t - this.kept.at < KEEP_MS) return this.kept.marks;
    const marks = weekMarks(await this.store.weekRanks(week));
    this.kept = { week, at: t, marks };
    return marks;
  }
}
