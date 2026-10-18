import { Container, Graphics } from 'pixi.js';
import { challengeBoardId, topPercent } from '@hk/protocol';
import { t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { milestonePay } from '../meta/challenge';
import type { BoardUi, FetchBoard } from './boardPanel';
import { iconSprite, type IconSheet } from './buildBar';
import type { DailyView } from './challengeFlow';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The daily challenge in the lobby (docs/design.md "Challenges"): a tile beside PLAY with the
// time left (or Done), which opens a panel with the rules, the milestones and what they pay, the
// player's share of the board once their run is in, and Play (Practice once the day's run
// counted) and Ranks. On another engine version than the record's, the tile says to update and
// the panel offers no run. The lobby shows no tile while there is no challenge (ui/challengeFlow.ts).

export interface ChallengeLobby {
  daily: DailyView;
  play(): void;
  /** Fetches a challenge board; null without a name on the boards. */
  board: FetchBoard | null;
}

export const TILE_W = 300;
const BOX_W = 960;
const BOX_H = 1460;

export class ChallengeUi {
  private open = false;

  constructor(
    /** Read at each layout: the record may come in while the lobby is up. */
    private readonly current: () => ChallengeLobby | null,
    private readonly boards: BoardUi,
    private readonly icons: IconSheet,
    private readonly relayout: () => void,
  ) {}

  /** The tile beside PLAY (`h` tall), or null when there is no challenge to show. */
  tile(h: number): Container | null {
    const d = this.current()?.daily;
    if (!d) return null;
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
    const tile = button('', TILE_W, h, () => this.show(true), { fill: d.state === 'open' ? COLORS.jade : COLORS.panelLocked, icon: face });
    // an open daily wears a dot, like the tabs with something waiting
    if (d.state === 'open') tile.addChild(new Graphics().circle(TILE_W / 2 - 22, -h / 2 + 14, 16).fill(COLORS.danger).stroke({ color: COLORS.outline, width: 4 }));
    return tile;
  }

  private show(on: boolean): void {
    this.open = on;
    this.relayout();
  }

  overlay(w: number, h: number): Container | null {
    const lobby = this.current();
    if (!this.open || !lobby) return null;
    const d = lobby.daily;
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
    add(t('challenge.title'), 68, COLORS.saffron, 80);
    add(t('lobby.chapterTitle', { n: d.chapter, name: t(`chapter.${d.chapter}` as never) }), 48, COLORS.text, 165);
    ['challenge.rule1', 'challenge.rule2', 'challenge.rule3'].forEach((key, i) => add(t(key as never), 40, COLORS.dim, 250 + i * 58));
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
        lobby.play();
      }, { fill: d.state === 'done' ? COLORS.panelLocked : COLORS.saffron, size: 60 }));
    }
    const fetchBoard = lobby.board;
    if (fetchBoard) {
      buttons.push(button(t('board.button'), 360, 140, () => {
        const id = challengeBoardId(d.challenge.id, d.challenge.engine, d.chapter);
        this.boards.show({ id, title: t('challenge.title'), sub: t('lobby.chapterTitle', { n: d.chapter, name: t(`chapter.${d.chapter}` as never) }), color: COLORS.saffron }, fetchBoard);
      }, { fill: COLORS.panelLocked, size: 52 }));
    }
    buttons.forEach((b, i) => {
      b.position.set(buttons.length === 1 ? 0 : i === 0 ? -200 : 220, top + 1170);
      box.addChild(b);
    });
    const back = button(t('common.back'), 400, 110, () => this.show(false), { fill: COLORS.panelLocked });
    back.y = top + BOX_H - 95;
    box.addChild(back);
    root.addChild(box);
    return root;
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
