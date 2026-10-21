import { Container, Graphics } from 'pixi.js';
import type { BoardRow, ChallengeBoardReply, TopRun } from '@hk/protocol';
import { t } from '../i18n';
import type { IconSheet } from './buildBar';
import { pickTimeline } from './pickTimeline';
import { COLORS, button, label } from './widgets';

// A weekly challenge board's own parts (docs/design.md "Challenges"): a Watch button on each of
// the top runs whose replay is kept, and the pick timeline of the top run chosen (the first at
// first; a tap on a top row chooses it), where a tap on a pick watches the run from there. Also
// the mark beside a name on any board: last week's weekly tier as a medal.

/** Watches a top run, from pick tick `from` (its start when absent); false when the replay could not be fetched. */
export type WatchTop = (row: BoardRow, top: TopRun, from?: number) => Promise<boolean>;

/** The weekly board's own state while it is open. */
export interface WeeklyBoardState {
  /** The top run whose timeline shows. */
  chosen: number;
  /** The tag whose replay is being fetched, or whose fetch failed. */
  busy: string | null;
  failed: string | null;
}

/** The medal colours by weekly tier: the top 50 %, the top 10 %, the top three. */
const MARK_FILL = [0, 0xc58a4a, 0xc8d0dc, COLORS.gold];

/** Last week's tier `mark` as a medal (null for none), `r` in radius. */
export function markMedal(mark: number | undefined, r: number): Container | null {
  if (!mark || !MARK_FILL[mark]) return null;
  const c = new Container();
  c.addChild(new Graphics().circle(0, 0, r).fill(MARK_FILL[mark]).stroke({ color: COLORS.outline, width: Math.max(3, r / 5) }));
  c.addChild(new Graphics().star(0, 0, 5, r * 0.55, r * 0.25).fill(COLORS.outline));
  return c;
}

/** The top runs of `r` on its rows: the row's index on the board and its TopRun, for those listed. */
export function topRows(r: ChallengeBoardReply, shown: number): { row: BoardRow; top: TopRun }[] {
  const out: { row: BoardRow; top: TopRun }[] = [];
  for (const top of r.top ?? []) {
    const row = r.rows.slice(0, shown).find((x) => x.tag === top.tag);
    if (row) out.push({ row, top });
  }
  return out;
}

/** The Watch button for a top row at `y` (null when its replay is not kept). */
export function watchButton(top: TopRun, st: WeeklyBoardState, y: number, watch: () => void): Container | null {
  if (!top.replay) return null;
  const busy = st.busy === top.tag;
  const text = busy ? t('weekly.loading') : st.failed === top.tag ? t('weekly.failed') : t('weekly.watch');
  const b = button(text, 170, 52, watch, { fill: busy ? COLORS.panelLocked : COLORS.saffron, size: 40 });
  b.position.set(345, y);
  if (busy) b.eventMode = 'none';
  return b;
}

/** The chosen top run's timeline under the board, `width` by `height` with its title, top at y 0. */
export function chosenTimeline(r: ChallengeBoardReply, st: WeeklyBoardState, shown: number, icons: IconSheet, width: number, height: number, name: (row: BoardRow) => string, watch: WatchTop): Container | null {
  const tops = topRows(r, shown);
  const at = tops[Math.min(st.chosen, tops.length - 1)];
  if (!at || at.top.picks.length === 0) return null;
  const c = new Container();
  const title = label(t('weekly.picks', { name: name(at.row) }), 40, COLORS.dim);
  title.y = 20;
  c.addChild(title);
  const tl = pickTimeline(at.top.picks, icons, width, height - 60, { max: 80, tap: at.top.replay ? (i) => void watch(at.row, at.top, at.top.picks[i].tick) : undefined });
  tl.y = 60;
  c.addChild(tl);
  return c;
}
