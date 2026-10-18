import { Container } from 'pixi.js';
import { boardId, DICE, packDice, topPercent, unpackDice, type BoardReply, type BoardRow } from '@hk/protocol';
import { t } from '../i18n';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The leaderboard (server/README.md): a button on the lobby's chapter card opens the board of
// that chapter and mode, fetched from the backend each time. Each row carries a tag the server
// made from the install and the player's name (ui/playerName.ts): a portal account's, else a
// dice name read here in the viewer's language; a row without either goes by a dice name made
// from the tag. Offline (no backend) there is no button.

export type FetchBoard = (id: string) => Promise<BoardReply | null>;

const BOX_W = 960;
const BOX_H = 1640;
const ROWS = 20;
const ROW_H = 58;

/** A dice name (protocol.ts packDice) in the player's language: "{adj} {noun} {n}" from the string table; '' for none. */
export function diceName(dice: number): string {
  const d = unpackDice(dice);
  if (!d) return '';
  return t('board.name', { adj: t('board.adjs').split('|')[d.adj], noun: t('board.nouns').split('|')[d.noun], n: d.num });
}

/** The dice name of a row that came without a name, made from its tag (the same on every screen). */
export function nameOf(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  const w = DICE.words;
  return diceName(packDice(h % w, Math.floor(h / w) % w, DICE.numMin + (Math.floor(h / 1000) % (DICE.numMax - DICE.numMin + 1))));
}

/**
 * What a row reached: a won run's bare time to a tenth (the jade colour says it was a clear, and
 * clears rank by time, so the tenth splits runs within a second), else the wave it fell on.
 */
export function resultOf(r: Pick<BoardRow, 'won' | 'wave' | 'tenths'>): string {
  if (!r.won) return t('board.wave', { wave: r.wave });
  const s = Math.floor(r.tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${r.tenths % 10}`;
}

/** A board to open: its id, its title and the line under it, and the title's colour. */
export interface BoardView {
  id: string;
  title: string;
  sub: string;
  color: number;
}

export class BoardUi {
  /** The board open, its reply once in ('failed' when the fetch did not work). */
  private open: BoardView | null = null;
  private reply: BoardReply | 'loading' | 'failed' = 'loading';

  constructor(private readonly fetchBoard: FetchBoard | null, private readonly relayout: () => void) {}

  /** The button that opens chapter `chapter`'s board, or null offline. */
  button(chapter: number, hard: boolean): Container | null {
    if (!this.fetchBoard) return null;
    const name = t(`chapter.${chapter}` as never);
    const view = { id: boardId(chapter, hard), title: t('board.title', { n: chapter, name }), sub: hard ? t('lobby.hard') : t('lobby.normal'), color: hard ? COLORS.danger : COLORS.text };
    return button(t('board.button'), 200, 80, () => this.show(view), { fill: COLORS.panelLocked, size: 44 });
  }

  /** Opens `view`'s board, fetched with `fetchBoard` (the challenge boards come through here with their own fetch). */
  show(view: BoardView, fetchBoard = this.fetchBoard): void {
    if (!fetchBoard) return;
    this.open = view;
    this.reply = 'loading';
    this.relayout();
    void fetchBoard(view.id).then((r) => {
      // a later open, or a close, wins
      if (this.open !== view) return;
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
    const title = fit(label(open.title, 60, open.color), BOX_W - 80);
    title.y = top + 80;
    const mode = fit(label(open.sub, 42, COLORS.dim), BOX_W - 80);
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
    // under it, the board's size; on a challenge board the player's share ("top N %"), or that
    // their run still waits for its re-simulation (ChallengeBoardReply.pending)
    const challenge = 'pending' in r;
    const pending = challenge && r.pending === true;
    if (r.mine && !shown && !challenge) return c;
    const text = pending ? t('challenge.checking') : challenge && r.mine ? t('challenge.top', { n: topPercent(r.mine.rank, r.total) }) : t('board.total', { n: r.total });
    const foot = label(text, 40, challenge && r.mine ? COLORS.saffron : COLORS.dim);
    foot.y = footY + (r.mine && !shown ? ROW_H + 10 : 0);
    c.addChild(foot);
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
  const name = r.name || diceName(r.dice) || nameOf(r.tag);
  const who = fit(label(mine ? t('board.you', { name }) : name, 44, fill, { align: 'left' }), 470);
  who.anchor.set(0, 0.5);
  who.x = -300;
  const result = label(resultOf(r), 44, r.won ? COLORS.jade : fill);
  result.anchor.set(1, 0.5);
  result.x = 430;
  c.addChild(rank, who, result);
  return c;
}
