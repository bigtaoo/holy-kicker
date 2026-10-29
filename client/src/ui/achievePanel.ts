import { Container } from 'pixi.js';
import { formatAmount, t, type Key } from '../i18n';
import { achievementOrder, achievementProgress, achievementState, achievementsClaimed, achievementsReady, readyJade, type AchievementGoal } from '../meta/achievements';
import { BALANCE } from '../meta/balance';
import { claimable } from '../meta/daily';
import { goalsClaimable } from '../meta/goals';
import type { Tier } from '../meta/gear';
import type { SaveData } from '../meta/save';
import { tierName } from './gearText';
import { COLORS, button, dot, fit, label, meter } from './widgets';

// The achievements page of the tasks panel (meta/achievements.ts), and the Daily / Weekly /
// Achievements switch the pages share at the top. Builders only, like economyPanels.ts.

export type TasksView = 'daily' | 'week' | 'achieve';

export interface AchievePanelActions {
  claim(i: number): void;
  claimAll(): void;
  page(n: number): void;
}

/** Both pages are this tall, so switching does not move the box. */
export const TASKS_BOX_H = 1640;
/** Where the first row sits below the box top, and the row pitch. */
export const ROWS_TOP = 350;
export const ROW_H = 170;
const PER_PAGE = 6;
/** A row's width: the box's on a portrait frame, one of two columns on a landscape one. */
export const COLUMN_W = 960;

/** The tasks box: a column of six rows, or on a landscape frame (too short for it) two columns of three. */
export interface TasksBox {
  w: number;
  h: number;
  /** Rows down a column. */
  rows: number;
}

export function tasksBox(wide: boolean): TasksBox {
  return wide ? { w: 2 * COLUMN_W, h: 1180, rows: PER_PAGE / 2 } : { w: COLUMN_W, h: TASKS_BOX_H, rows: PER_PAGE };
}

/** Row `k`'s middle, the box top at `top`: down the first column, then the second. */
export function rowSpot(b: TasksBox, k: number, top: number): { x: number; y: number } {
  const cols = b.w / COLUMN_W;
  const col = Math.floor(k / b.rows);
  return { x: cols > 1 ? (col - (cols - 1) / 2) * COLUMN_W : 0, y: top + ROWS_TOP + (k % b.rows) * ROW_H };
}

/** Just under the rows when `count` of them are shown. */
export function rowsEnd(b: TasksBox, count: number, top: number): number {
  return top + ROWS_TOP + Math.min(b.rows, count) * ROW_H;
}

/** The Daily / Weekly / Achievements switch across a box `w` wide, centred on x = 0, each with a dot when something waits. */
export function tasksSwitch(save: SaveData, now: number, view: TasksView, w: number, pick: (v: TasksView) => void): Container {
  const c = new Container();
  const tabs: [TasksView, Key, boolean][] = [
    ['daily', 'tasks.tabDay', claimable(save, now) > 0],
    ['week', 'tasks.tabWeek', goalsClaimable(save, now) > 0],
    ['achieve', 'achieve.title', achievementsReady(save).length > 0],
  ];
  const pitch = Math.min(440, (w - 40) / tabs.length);
  const tabW = pitch - 20;
  tabs.forEach(([v, key, waiting], i) => {
    const on = v === view;
    const b = button(t(key), tabW, 120, () => !on && pick(v), {
      fill: on ? COLORS.saffron : COLORS.panelLocked, textFill: on ? COLORS.text : COLORS.dim, size: 48,
    });
    b.x = (i - (tabs.length - 1) / 2) * pitch;
    if (waiting && !on) b.addChild(dot(tabW / 2 - 20, -45));
    c.addChild(b);
  });
  return c;
}

export function achievePages(): number {
  return Math.ceil(BALANCE.achievements.length / PER_PAGE);
}

/** What the goal asks for, in the player's words. */
function goalText(g: AchievementGoal): string {
  const n = g.kind === 'kills' ? formatAmount(g.n) : String(g.n);
  return t(`achieve.${g.kind}`, { n, tier: tierName(Math.min(4, g.n) as Tier) });
}

/** The rows of page `page` (ready ones first), the claim-all offer and the pager, from the box top `top`. */
export function achieveRows(save: SaveData, page: number, box: TasksBox, top: number, a: AchievePanelActions): Container {
  const c = new Container();
  const goals = BALANCE.achievements;
  const pages = achievePages();
  const p = Math.min(Math.max(page, 0), pages - 1);

  const ready = achievementsReady(save).length;
  if (ready > 0) {
    const all = button(t('achieve.claimAll', { jade: readyJade(save) }), 760, 100, a.claimAll, { fill: COLORS.jade, textFill: COLORS.outline, size: 48 });
    all.y = top + 215;
    c.addChild(all);
  } else {
    const done = label(t('achieve.claimed', { n: achievementsClaimed(save), total: goals.length }), 48, COLORS.dim);
    done.y = top + 215;
    c.addChild(done);
  }

  achievementOrder(save).slice(p * PER_PAGE, (p + 1) * PER_PAGE).forEach((i, k) => {
    const g = goals[i];
    const state = achievementState(save, i);
    const row = new Container();
    const spot = rowSpot(box, k, top);
    row.position.set(spot.x, spot.y);
    const name = fit(label(goalText(g), 48, state === 'claimed' ? COLORS.dim : COLORS.text, { align: 'left' }), 560);
    name.anchor.set(0, 0.5);
    name.position.set(-430, -30);
    const have = Math.min(g.n, achievementProgress(save, g.kind));
    const bar = meter(320, have / g.n, state === 'open' ? COLORS.copper : COLORS.jade);
    bar.view.position.set(-270, 40);
    row.addChild(name, bar.view);
    // a tier is a rank, not a count
    if (g.kind !== 'tier') {
      const count = label(g.kind === 'kills' ? `${formatAmount(have)}/${formatAmount(g.n)}` : `${have}/${g.n}`, 48, COLORS.dim);
      count.anchor.set(0, 0.5);
      // "10K/10K" stays clear of the claim button
      count.position.set(-90, 40);
      row.addChild(count);
    }
    if (state === 'open') {
      const pays = label(t('achieve.reward', { jade: g.jade }), 48, COLORS.jade);
      pays.x = 320;
      row.addChild(pays);
    } else {
      const on = state === 'ready';
      const b = button(on ? t('achieve.claim', { jade: g.jade }) : t('tasks.done'), 270, 110, () => on && a.claim(i), {
        fill: on ? COLORS.saffron : COLORS.panelLocked, textFill: on ? COLORS.text : COLORS.dim, size: 48,
      });
      b.x = 305;
      row.addChild(b);
    }
    c.addChild(row);
  });

  const y = rowsEnd(box, PER_PAGE, top) - 30;
  const at = label(t('achieve.page', { page: p + 1, pages }), 48, COLORS.dim);
  at.y = y;
  c.addChild(at);
  for (const dir of [-1, 1]) {
    const target = p + dir;
    const ok = target >= 0 && target < pages;
    const b = button(dir < 0 ? '‹' : '›', 140, 110, () => ok && a.page(target), {
      fill: ok ? COLORS.panel : COLORS.panelLocked, textFill: ok ? COLORS.text : COLORS.dim, size: 72,
    });
    b.position.set(dir * 260, y);
    // a dead end reads as one: the arrow fades rather than only darkening a shade
    if (!ok) b.alpha = 0.4;
    c.addChild(b);
  }
  return c;
}
