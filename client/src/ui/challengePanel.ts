import { Container, Graphics } from 'pixi.js';
import { challengeBoardId, topPercent, type Challenge, type TopRun } from '@hk/protocol';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { milestonePay } from '../meta/challenge';
import type { WeekClaim } from '../meta/weekly';
import { THEME } from '../theme';
import { rowName, type BoardUi, type FetchBoard } from './boardPanel';
import { iconSprite, type IconSheet } from './buildBar';
import type { DailyView, WeeklyView } from './challengeFlow';
import { claimCard, mutatorLine, weeklyPage } from './weeklyPage';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The challenges in the lobby (docs/design.md "Challenges"): a tile beside PLAY with the daily's
// time left (or Done; the weekly's when there is no daily), which opens a panel with a tab for
// each. The daily's: its mutator, the rules, the milestones and what they pay, the player's share of the board
// once their run is in, and Play (Practice once the day's run counted) and Ranks. The weekly's:
// ui/weeklyPage.ts, its board with the top runs to watch. On another engine version than the
// record's, the tile says to update and the panel offers no run. A closed week waiting to be paid
// shows its claim card over the lobby. The lobby shows no tile while there is no challenge
// (ui/challengeFlow.ts).

export interface ChallengeLobby {
  daily: DailyView | null;
  weekly: WeeklyView | null;
  /** A closed week's reward ready to claim. */
  claim: WeekClaim | null;
  /** Starts a run of `c` on `chapter`. */
  play(c: Challenge, chapter: number): void;
  /** Fetches a challenge board; null without a name on the boards. */
  board: FetchBoard | null;
  /** Fetches weekly board `board`'s top run and watches it (from pick tick `from`); null without a name on the boards. */
  watch: ((board: string, top: TopRun, name: string, from?: number) => Promise<boolean>) | null;
  /** Pays `claim` into the save. */
  take(claim: WeekClaim): void;
}

type Tab = 'daily' | 'weekly';

export const TILE_W = 300;
const BOX_W = 960;
const BOX_H = 1460;

export class ChallengeUi {
  private open = false;
  private tab: Tab = 'daily';

  constructor(
    /** Read at each layout: the record may come in while the lobby is up. */
    private readonly current: () => ChallengeLobby | null,
    private readonly boards: BoardUi,
    private readonly icons: IconSheet,
    private readonly relayout: () => void,
  ) {}

  /** The tile beside PLAY (`h` tall), or null when there is no challenge to show. */
  tile(h: number): Container | null {
    const lobby = this.current();
    const d = lobby?.daily;
    if (!d) return lobby?.weekly ? this.weeklyTile(lobby.weekly, h) : null;
    const face = new Container();
    const icon = iconSprite(this.icons, 'lotus', 64);
    if (icon) {
      icon.y = -h / 2 + 50;
      face.addChild(icon);
    }
    const name = fit(label(t('challenge.tile'), 44, d.state === 'update' ? COLORS.dim : COLORS.text), TILE_W - 40);
    name.y = 10;
    const sub = fit(label(
      d.state === 'update' ? t('challenge.tileUpdate') : d.state === 'done' ? t('challenge.tileDone') : t('challenge.tileOpen', { h: d.hours }),
      34, d.state === 'done' ? COLORS.jade : d.state === 'open' ? COLORS.text : COLORS.dim,
    ), TILE_W - 40);
    sub.y = 58;
    face.addChild(name, sub);
    const tile = button('', TILE_W, h, () => this.show(true, 'daily'), { fill: d.state === 'open' ? COLORS.jade : COLORS.panelLocked, icon: face });
    // an open daily (or a weekly not played yet this week) wears a dot, like the tabs with something waiting
    if (d.state === 'open' || (lobby.weekly?.state === 'open' && lobby.weekly.best === 0)) tile.addChild(new Graphics().circle(TILE_W / 2 - 22, -h / 2 + 14, 16).fill(COLORS.danger).stroke({ color: COLORS.outline, width: 4 }));
    return tile;
  }

  /** The tile when the weekly is the only challenge: its time left, a dot until played this week. */
  private weeklyTile(wk: WeeklyView, h: number): Container {
    const face = new Container();
    const icon = iconSprite(this.icons, wk.challenge.loadout!.relic, 64);
    if (icon) {
      icon.y = -h / 2 + 50;
      face.addChild(icon);
    }
    const open = wk.state === 'open';
    const name = fit(label(t('weekly.tab'), 44, open ? COLORS.text : COLORS.dim), TILE_W - 40);
    name.y = 10;
    const sub = fit(label(open ? (wk.days > 0 ? t('weekly.tileOpen', { d: wk.days, h: wk.hours }) : t('challenge.tileOpen', { h: wk.hours })) : t('challenge.tileUpdate'), 34, open ? COLORS.text : COLORS.dim), TILE_W - 40);
    sub.y = 58;
    face.addChild(name, sub);
    const tile = button('', TILE_W, h, () => this.show(true, 'weekly'), { fill: open ? COLORS.jade : COLORS.panelLocked, icon: face });
    if (open && wk.best === 0) tile.addChild(new Graphics().circle(TILE_W / 2 - 22, -h / 2 + 14, 16).fill(COLORS.danger).stroke({ color: COLORS.outline, width: 4 }));
    return tile;
  }

  private show(on: boolean, tab: Tab = this.tab): void {
    this.open = on;
    this.tab = tab;
    this.relayout();
  }

  overlay(w: number, h: number): Container | null {
    const lobby = this.current();
    if (lobby?.claim) {
      const c = lobby.claim;
      return claimCard(w, h, c, this.icons, () => lobby.take(c));
    }
    if (!this.open || !lobby) return null;
    const tab: Tab = !lobby.daily ? 'weekly' : !lobby.weekly ? 'daily' : this.tab;
    const root = new Container();
    root.addChild(backdrop(w, h));
    const box = new Container();
    box.position.set(w / 2, h / 2);
    const top = -BOX_H / 2;
    box.addChild(panel(BOX_W, BOX_H));
    const add = (text: string, size: number, fill: number, y: number) => {
      const l = fit(label(text, size, fill), BOX_W - 100);
      l.y = top + y;
      box.addChild(l);
    };
    // a tab for each challenge when both are open, else the one's title
    if (lobby.daily && lobby.weekly) {
      (['daily', 'weekly'] as const).forEach((k, i) => {
        const b = button(t(k === 'daily' ? 'challenge.tile' : 'weekly.tab'), 400, 100, () => this.show(true, k), { fill: k === tab ? COLORS.saffron : COLORS.panelLocked, size: 50 });
        b.position.set(i === 0 ? -210 : 210, top + 80);
        box.addChild(b);
      });
    } else add(t(tab === 'daily' ? 'challenge.title' : 'weekly.title'), 68, COLORS.saffron, 80);
    if (tab === 'weekly' && lobby.weekly) this.weekly(box, top, lobby, lobby.weekly);
    else if (lobby.daily) this.daily(box, top, add, lobby, lobby.daily);
    const back = button(t('common.back'), 400, 110, () => this.show(false), { fill: COLORS.panelLocked });
    back.y = top + BOX_H - 95;
    box.addChild(back);
    root.addChild(box);
    return root;
  }

  private weekly(box: Container, top: number, lobby: ChallengeLobby, wk: WeeklyView): void {
    const fetchBoard = lobby.board;
    const watch = wk.state === 'open' ? lobby.watch : null;
    const chapter = wk.challenge.loadout!.chapter;
    weeklyPage(box, top, BOX_W, wk, this.icons, {
      play: () => {
        this.open = false;
        lobby.play(wk.challenge, chapter);
      },
      ranks: fetchBoard && (() => this.boards.show(
        { id: wk.board, title: t('weekly.title'), sub: t('lobby.chapterTitle', { n: chapter, name: t(`chapter.${chapter}` as never) }), color: COLORS.saffron },
        fetchBoard,
        watch && ((row, topRun, from) => watch(wk.board, topRun, rowName(row), from)),
      )),
    });
  }

  private daily(box: Container, top: number, add: (text: string, size: number, fill: number, y: number) => void, lobby: ChallengeLobby, d: DailyView): void {
    add(t('lobby.chapterTitle', { n: d.chapter, name: t(`chapter.${d.chapter}` as never) }), 48, COLORS.text, 165);
    const mutator = mutatorLine(d.challenge.mutator);
    if (mutator) add(mutator, 42, COLORS.saffron, 232);
    ['challenge.rule1', 'challenge.rule2', 'challenge.rule3'].forEach((key, i) => add(t(key as never), 40, COLORS.dim, (mutator ? 295 : 250) + i * 56));
    add(t('challenge.milestones'), 48, COLORS.text, 470);
    BALANCE.challenge.milestones.forEach((m, i) => box.addChild(this.milestoneRow(milestonePay(m, d.chapter), top + 560 + i * 90, d.state === 'done')));
    // where the day stands: time left, done (with the board share once known), or update
    let y = 920;
    if (d.state === 'update') add(t('challenge.update'), 44, COLORS.danger, y);
    else if (d.state === 'done') add(t('challenge.done'), 48, COLORS.jade, y);
    else add(t('challenge.ends', { h: d.hours }), 44, COLORS.text, y);
    y += 65;
    if (d.state === 'done') {
      if (d.reply) add(t('challenge.top', { n: topPercent(d.reply.rank, d.reply.total) }), 52, COLORS.saffron, y);
      add(t('challenge.next', { h: d.hours }), 40, COLORS.dim, y + 60);
    }
    const buttons: Container[] = [];
    if (d.state !== 'update') {
      buttons.push(button(t(d.state === 'done' ? 'challenge.practice' : 'lobby.play'), 420, 140, () => {
        this.open = false;
        lobby.play(d.challenge, d.chapter);
      }, { fill: d.state === 'done' ? COLORS.panelLocked : COLORS.saffron, size: 60 }));
    }
    const fetchBoard = lobby.board;
    if (fetchBoard) {
      buttons.push(button(t('board.button'), 360, 140, () => {
        const id = challengeBoardId(d.challenge.id, d.challenge.engine, d.chapter, THEME);
        this.boards.show({ id, title: t('challenge.title'), sub: t('lobby.chapterTitle', { n: d.chapter, name: t(`chapter.${d.chapter}` as never) }), color: COLORS.saffron }, fetchBoard);
      }, { fill: COLORS.panelLocked, size: 52 }));
    }
    buttons.forEach((b, i) => {
      b.position.set(buttons.length === 1 ? 0 : i === 0 ? -200 : 220, top + 1170);
      box.addChild(b);
    });
  }

  /** "Clear wave N" and what it pays, copper and jade, on one row. */
  private milestoneRow(m: { wave: number; copper: number; jade: number }, y: number, dim: boolean): Container {
    const row = new Container();
    row.y = y;
    const name = label(t('challenge.wave', { wave: m.wave }), 44, dim ? COLORS.dim : COLORS.text, { align: 'left' });
    name.anchor.set(0, 0.5);
    name.x = -400;
    row.addChild(name);
    const chip = (icon: string, n: number, fill: number, x: number) => {
      const s = iconSprite(this.icons, icon, 56);
      if (s) {
        s.x = x;
        row.addChild(s);
      }
      const l = label(`+${n}`, 44, dim ? COLORS.dim : fill);
      l.anchor.set(0, 0.5);
      l.x = x + 40;
      row.addChild(l);
    };
    chip('copper', m.copper, COLORS.copper, 90);
    chip('jade', m.jade, COLORS.jade, 290);
    return row;
  }
}
