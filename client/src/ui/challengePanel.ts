import { Container } from 'pixi.js';
import { challengeBoardId, topPercent, type Challenge, type TopRun } from '@hk/protocol';
import { t } from '../i18n';
import { chapterName } from '../i18n/chapterName';
import { BALANCE } from '../meta/balance';
import { milestonePay } from '../meta/challenge';
import type { WeekClaim } from '../meta/weekly';
import { THEME } from '../theme';
import { rowName, type BoardUi, type FetchBoard } from './boardPanel';
import { iconSprite, type IconSheet } from './buildBar';
import type { DailyView, WeeklyView } from './challengeFlow';
import { railButton } from './lobbyRail';
import { claimCard, mutatorLine, ruleLines, weeklyPage, weeklyRules, type Rules } from './weeklyPage';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The challenges in the lobby (docs/design.md "Challenges"): a round button on the Play tab's right rail with the daily's
// time left (or Done; the weekly's when there is no daily), which opens a panel with a tab for
// each. The daily's: its mutator, the rules, the milestones and what they pay, the player's share of the board
// once their run is in (offline, made up on the device: the day's best instead, and no Ranks), the
// streak and what its next day pays, and Play (Practice once the day's run counted) and Ranks. The weekly's:
// ui/weeklyPage.ts, its board with the top runs to watch. On another engine version than the
// record's, the button says to update and the panel offers no run. A closed week waiting to be paid
// shows its claim card over the lobby. The lobby shows no button while there is no challenge
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

const BOX_W = 960;
/** Each page's box before its rules' grow: Back 40 under the page's own buttons (daily's at 1240, weekly's at 1235). */
const DAILY_H = 1500;
const WEEKLY_H = 1490;

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

  /** The button on the Play tab's right rail, or null when there is no challenge to show. */
  rail(): Container | null {
    const lobby = this.current();
    const d = lobby?.daily;
    if (!d) return lobby?.weekly ? this.weeklyRail(lobby.weekly) : null;
    // an open daily (or a weekly not played yet this week) wears a dot, like the tabs with something waiting
    return railButton({
      icon: iconSprite(this.icons, 'daily', 100),
      name: t('challenge.tile'),
      sub: d.state === 'update' ? t('challenge.tileUpdate') : d.state === 'done' ? t('challenge.tileDone') : t('challenge.tileOpen', { h: d.hours }),
      lit: d.state === 'open',
      dim: d.state !== 'open',
      dot: d.state === 'open' || (lobby.weekly?.state === 'open' && lobby.weekly.best === 0),
    }, () => this.show(true, 'daily')).view;
  }

  /** The rail button when the weekly is the only challenge: its time left, a dot until played this week. */
  private weeklyRail(wk: WeeklyView): Container {
    const open = wk.state === 'open';
    return railButton({
      icon: iconSprite(this.icons, wk.challenge.loadout!.relic, 100),
      name: t('weekly.tab'),
      sub: open ? (wk.days > 0 ? t('weekly.tileOpen', { d: wk.days, h: wk.hours }) : t('challenge.tileOpen', { h: wk.hours })) : t('challenge.tileUpdate'),
      lit: open && wk.best === 0,
      dim: !open,
      dot: open && wk.best === 0,
    }, () => this.show(true, 'weekly')).view;
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
    // each tab's wrapped rules push what follows down, and each page's box ends under its own
    // buttons; the box's top stays put when the tab changes, where the taller page's would be
    const daily = lobby.daily ? dailyRules() : null;
    const weekly = lobby.weekly ? weeklyRules(lobby.weekly, BOX_W) : null;
    const dailyH = daily ? DAILY_H + daily.grow : 0;
    const weeklyH = weekly ? WEEKLY_H + weekly.grow : 0;
    const boxH = tab === 'weekly' ? weeklyH : dailyH;
    const tallest = Math.max(dailyH, weeklyH);
    const scale = Math.min(1, (h - 40) / tallest);
    box.scale.set(scale);
    box.position.set(w / 2, h / 2 + ((boxH - tallest) / 2) * scale);
    const top = -boxH / 2;
    box.addChild(panel(BOX_W, boxH));
    const add = (text: string, size: number, fill: number, y: number) => {
      const l = fit(label(text, size, fill), BOX_W - 100);
      l.y = top + y;
      box.addChild(l);
    };
    // a tab for each challenge when both are open, else the one's title
    if (lobby.daily && lobby.weekly) {
      (['daily', 'weekly'] as const).forEach((k, i) => {
        const on = k === tab;
        const b = button(t(k === 'daily' ? 'challenge.tile' : 'weekly.tab'), 400, 100, () => this.show(true, k), {
          fill: on ? COLORS.saffron : COLORS.panelLocked, textFill: on ? COLORS.text : COLORS.dim, size: 50,
        });
        b.position.set(i === 0 ? -210 : 210, top + 80);
        box.addChild(b);
      });
    } else add(t(tab === 'daily' ? 'challenge.title' : 'weekly.title'), 68, COLORS.saffron, 80);
    if (tab === 'weekly' && lobby.weekly && weekly) this.weekly(box, top, lobby, lobby.weekly, weekly);
    else if (lobby.daily && daily) this.daily(box, top, add, lobby, lobby.daily, daily);
    for (const r of [daily, weekly]) if (r && !r.view.parent) r.view.destroy({ children: true });
    const back = button(t('common.back'), 400, 110, () => this.show(false), { fill: COLORS.panelLocked });
    back.y = top + boxH - 95;
    box.addChild(back);
    root.addChild(box);
    return root;
  }

  private weekly(box: Container, top: number, lobby: ChallengeLobby, wk: WeeklyView, rules: Rules): void {
    const fetchBoard = lobby.board;
    const watch = wk.state === 'open' ? lobby.watch : null;
    const chapter = wk.challenge.loadout!.chapter;
    weeklyPage(box, top, BOX_W, wk, this.icons, rules, {
      play: () => {
        this.open = false;
        lobby.play(wk.challenge, chapter);
      },
      ranks: fetchBoard && (() => this.boards.show(
        { id: wk.board, title: t('weekly.title'), sub: t('lobby.chapterTitle', { n: chapter, name: chapterName(chapter) }), color: COLORS.saffron },
        fetchBoard,
        watch && ((row, topRun, from) => watch(wk.board, topRun, rowName(row), from)),
      )),
    });
  }

  /** The daily's page; everything under `rules` (dailyRules) moves down by their grow. */
  private daily(box: Container, top: number, add: (text: string, size: number, fill: number, y: number) => void, lobby: ChallengeLobby, d: DailyView, rules: Rules): void {
    const grow = rules.grow;
    add(t('lobby.chapterTitle', { n: d.chapter, name: chapterName(d.chapter) }), 48, COLORS.text, 165);
    const mutator = mutatorLine(d.challenge.mutator);
    if (mutator) add(mutator, 48, COLORS.saffron, 232);
    rules.view.y = top + (mutator ? 270 : 225);
    box.addChild(rules.view);
    add(t('challenge.milestones'), 48, COLORS.text, 470 + grow);
    BALANCE.challenge.milestones.forEach((m, i) => box.addChild(this.milestoneRow(milestonePay(m, d.chapter), top + grow + 560 + i * 90, d.state === 'done')));
    // the streak and what its next day pays, then where the day stands: time left, done (with the
    // board share once known, or the day's best offline), or update
    let y = 920 + grow;
    if (d.state !== 'update') {
      box.addChild(this.streakRow(d, top + y));
      y += 70;
    }
    if (d.state === 'update') add(t('challenge.update'), 48, COLORS.danger, y);
    else if (d.state === 'done') add(t('challenge.done'), 48, COLORS.jade, y);
    else add(t('challenge.ends', { h: d.hours }), 48, COLORS.text, y);
    y += 65;
    if (d.state === 'done') {
      if (d.local) add(t('challenge.best', { wave: d.best }), 52, COLORS.saffron, y);
      else if (d.reply) add(t('challenge.top', { n: topPercent(d.reply.rank, d.reply.total) }), 52, COLORS.saffron, y);
      add(t('challenge.next', { h: d.hours }), 48, COLORS.dim, y + 60);
    } else if (d.local) add(t('challenge.offline'), 48, COLORS.dim, y);
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
        this.boards.show({ id, title: t('challenge.title'), sub: t('lobby.chapterTitle', { n: d.chapter, name: chapterName(d.chapter) }), color: COLORS.saffron }, fetchBoard);
      }, { fill: COLORS.panelLocked, size: 52 }));
    }
    buttons.forEach((b, i) => {
      b.position.set(buttons.length === 1 ? 0 : i === 0 ? -200 : 220, top + grow + 1240);
      box.addChild(b);
    });
  }

  /** The streak in days (or none yet), and the jade its next day pays. */
  private streakRow(d: DailyView, y: number): Container {
    const row = new Container();
    row.y = y;
    const text = label(d.streak > 0 ? t('challenge.streak', { n: d.streak }) : t('challenge.streakNone'), 48, COLORS.gold);
    const s = iconSprite(this.icons, 'jade', 56);
    const pay = label(t(d.state === 'done' ? 'challenge.streakTomorrow' : 'challenge.streakToday', { n: d.nextStreakJade }), 48, COLORS.jade);
    text.anchor.set(0, 0.5);
    pay.anchor.set(0, 0.5);
    const w = text.width + 30 + (s ? 60 : 0) + pay.width;
    text.x = -w / 2;
    if (s) {
      s.x = text.x + text.width + 30 + 28;
      row.addChild(s);
    }
    pay.x = text.x + text.width + 30 + (s ? 60 : 0);
    row.addChild(text, pay);
    return row;
  }

  /** "Clear wave N" and what it pays, copper and jade, on one row. */
  private milestoneRow(m: { wave: number; copper: number; jade: number }, y: number, dim: boolean): Container {
    const row = new Container();
    row.y = y;
    const name = label(t('challenge.wave', { wave: m.wave }), 48, dim ? COLORS.dim : COLORS.text, { align: 'left' });
    name.anchor.set(0, 0.5);
    name.x = -400;
    row.addChild(name);
    const chip = (icon: string, n: number, fill: number, x: number) => {
      const s = iconSprite(this.icons, icon, 56);
      if (s) {
        s.x = x;
        row.addChild(s);
      }
      const l = label(`+${n}`, 48, dim ? COLORS.dim : fill);
      l.anchor.set(0, 0.5);
      l.x = x + 40;
      row.addChild(l);
    };
    chip('copper', m.copper, COLORS.copper, 90);
    chip('jade', m.jade, COLORS.jade, 290);
    return row;
  }
}

/** The daily's rules: they once had 56 a line; 24 more keeps them off the milestones' title. */
function dailyRules(): Rules {
  const view = ruleLines(['challenge.rule1', 'challenge.rule2', 'challenge.rule3'], BOX_W - 100);
  return { view, grow: Math.max(0, view.height + 24 - 3 * 56) };
}
