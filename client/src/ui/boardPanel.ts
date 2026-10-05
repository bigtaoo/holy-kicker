import { Container } from 'pixi.js';
import { boardId, type BoardReply, type BoardRow } from '@hk/protocol';
import { t } from '../i18n';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The leaderboard (server/README.md): a button on the lobby's chapter card opens the board of
// that chapter and mode, fetched from the backend each time. Players are anonymous: each row
// carries a tag the server made from the install, and the name shown is built from it here, so
// nobody types a name and nothing needs moderating. Offline (no backend) there is no button.

export type FetchBoard = (id: string) => Promise<BoardReply | null>;

const BOX_W = 960;
const BOX_H = 1640;
const ROWS = 20;
const ROW_H = 58;

/** A friendly name for a tag, the same on every screen: "{adj} {noun} {n}" from the string table. */
export function nameOf(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  const adjs = t('board.adjs').split('|');
  const nouns = t('board.nouns').split('|');
  return t('board.name', { adj: adjs[h % adjs.length], noun: nouns[Math.floor(h / adjs.length) % nouns.length], n: 10 + (Math.floor(h / 1000) % 90) });
}

/** What a row reached: a won run's time, else the wave it fell on. */
export function resultOf(r: Pick<BoardRow, 'won' | 'wave' | 'tenths'>): string {
  if (!r.won) return t('board.wave', { wave: r.wave });
  const s = Math.floor(r.tenths / 10);
  return t('board.time', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
}

export class BoardUi {
  /** The board open, its reply once in ('failed' when the fetch did not work). */
  private open: { chapter: number; hard: boolean } | null = null;
  private reply: BoardReply | 'loading' | 'failed' = 'loading';

  constructor(private readonly fetchBoard: FetchBoard | null, private readonly relayout: () => void) {}

  /** The button that opens chapter `chapter`'s board, or null offline. */
  button(chapter: number, hard: boolean): Container | null {
    if (!this.fetchBoard) return null;
    return button(t('board.button'), 200, 90, () => this.show(chapter, hard), { fill: COLORS.panelLocked, size: 44 });
  }

  private show(chapter: number, hard: boolean): void {
    const fetchBoard = this.fetchBoard;
    if (!fetchBoard) return;
    const open = { chapter, hard };
    this.open = open;
    this.reply = 'loading';
    this.relayout();
    void fetchBoard(boardId(chapter, hard)).then((r) => {
      // a later open, or a close, wins
      if (this.open !== open) return;
      this.reply = r ?? 'failed';
      this.relayout();
    });
  }

  overlay(w: number, h: number): Container | null {
    const open = this.open;
    if (!open) return null;
    const root = new Container();
    root.addChild(backdrop(w, h));
    const box = new Container();
    box.position.set(w / 2, h / 2);
    const top = -BOX_H / 2;
    box.addChild(panel(BOX_W, BOX_H));
    const name = t(`chapter.${open.chapter}` as never);
    const title = fit(label(t('board.title', { n: open.chapter, name }), 60, open.hard ? COLORS.danger : COLORS.text), BOX_W - 80);
    title.y = top + 80;
    const mode = label(open.hard ? t('lobby.hard') : t('lobby.normal'), 42, COLORS.dim);
    mode.y = top + 150;
    box.addChild(title, mode, this.body(top + 230));
    const back = button(t('common.back'), 400, 110, () => {
      this.open = null;
      this.relayout();
    }, { fill: COLORS.panelLocked });
    back.y = top + BOX_H - 90;
    box.addChild(back);
    root.addChild(box);
    return root;
  }

  private body(y0: number): Container {
    const c = new Container();
    const r = this.reply;
    if (r === 'loading' || r === 'failed' || r.rows.length === 0) {
      const text = label(r === 'loading' ? t('board.loading') : r === 'failed' ? t('board.failed') : t('board.empty'), 48, COLORS.dim);
      text.y = y0 + 400;
      c.addChild(text);
      return c;
    }
    const mineTag = r.mine?.tag ?? null;
    r.rows.slice(0, ROWS).forEach((row, i) => c.addChild(rowView(row, row.tag === mineTag, y0 + i * ROW_H)));
    // the player's own row under the list when it is not on it
    const shown = r.rows.slice(0, ROWS).some((row) => row.tag === mineTag);
    const footY = y0 + ROWS * ROW_H + 40;
    if (r.mine && !shown) c.addChild(rowView(r.mine, true, footY));
    else {
      const total = label(t('board.total', { n: r.total }), 40, COLORS.dim);
      total.y = footY;
      c.addChild(total);
    }
    return c;
  }
}

function rowView(r: BoardRow, mine: boolean, y: number): Container {
  const c = new Container();
  c.y = y;
  if (mine) c.addChild(panel(BOX_W - 60, ROW_H - 6, COLORS.panelLocked, 14));
  const fill = mine ? COLORS.saffron : r.rank <= 3 ? COLORS.text : COLORS.dim;
  const rank = label(String(r.rank), 44, fill);
  rank.anchor.set(1, 0.5);
  rank.x = -330;
  const who = fit(label(mine ? t('board.you', { name: nameOf(r.tag) }) : nameOf(r.tag), 44, fill, { align: 'left' }), 470);
  who.anchor.set(0, 0.5);
  who.x = -300;
  const result = label(resultOf(r), 44, r.won ? COLORS.jade : fill);
  result.anchor.set(1, 0.5);
  result.x = 430;
  c.addChild(rank, who, result);
  return c;
}
