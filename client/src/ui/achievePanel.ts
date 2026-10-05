import { Container } from 'pixi.js';
import { formatAmount, t, type Key } from '../i18n';
import { achievementOrder, achievementProgress, achievementState, achievementsClaimed, achievementsReady, readyJade, type AchievementGoal } from '../meta/achievements';
import { BALANCE } from '../meta/balance';
import { claimable } from '../meta/daily';
import type { SaveData } from '../meta/save';
import { COLORS, button, dot, fit, label, meter } from './widgets';

// The achievements page of the tasks panel (meta/achievements.ts), and the Daily /
// Achievements switch both pages share at the top. Builders only, like economyPanels.ts.

export type TasksView = 'daily' | 'achieve';

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

/** The Daily / Achievements switch, centred on x = 0, each with a dot when something waits. */
export function tasksSwitch(save: SaveData, now: number, view: TasksView, pick: (v: TasksView) => void): Container {
  const c = new Container();
  const tabs: [TasksView, Key, boolean][] = [
    ['daily', 'tasks.title', claimable(save, now) > 0],
    ['achieve', 'achieve.title', achievementsReady(save).length > 0],
  ];
  tabs.forEach(([v, key, waiting], i) => {
    const on = v === view;
    const b = button(t(key), 420, 120, () => !on && pick(v), {
      fill: on ? COLORS.saffron : COLORS.panelLocked, textFill: on ? COLORS.text : COLORS.dim, size: 48,
    });
    b.x = (i - 0.5) * 440;
    if (waiting && !on) b.addChild(dot(190, -45));
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
  return t(`achieve.${g.kind}`, { n, tier: t(`tier.${Math.min(4, g.n) as 0 | 1 | 2 | 3 | 4}`) });
}

/** The rows of page `page` (ready ones first), the claim-all offer and the pager, from the box top `top`. */
export function achieveRows(save: SaveData, page: number, top: number, a: AchievePanelActions): Container {
  const c = new Container();
  const goals = BALANCE.achievements;
  const pages = achievePages();
  const p = Math.min(Math.max(page, 0), pages - 1);

  const ready = achievementsReady(save).length;
  if (ready > 0) {
    const all = button(t('achieve.claimAll', { jade: readyJade(save) }), 760, 100, a.claimAll, { fill: COLORS.jade, textFill: COLORS.outline, size: 44 });
    all.y = top + 215;
    c.addChild(all);
  } else {
    const done = label(t('achieve.claimed', { n: achievementsClaimed(save), total: goals.length }), 40, COLORS.dim);
    done.y = top + 215;
    c.addChild(done);
  }

  achievementOrder(save).slice(p * PER_PAGE, (p + 1) * PER_PAGE).forEach((i, k) => {
    const g = goals[i];
    const state = achievementState(save, i);
    const row = new Container();
    row.y = top + ROWS_TOP + k * ROW_H;
    const name = fit(label(goalText(g), 46, state === 'claimed' ? COLORS.dim : COLORS.text, { align: 'left' }), 560);
    name.anchor.set(0, 0.5);
    name.position.set(-430, -30);
    const have = Math.min(g.n, achievementProgress(save, g.kind));
    const bar = meter(380, have / g.n, state === 'open' ? COLORS.copper : COLORS.jade);
    bar.view.position.set(-240, 40);
    row.addChild(name, bar.view);
    // a tier is a rank, not a count
    if (g.kind !== 'tier') {
      const count = label(g.kind === 'kills' ? `${formatAmount(have)}/${formatAmount(g.n)}` : `${have}/${g.n}`, 42, COLORS.dim);
      count.anchor.set(0, 0.5);
      count.position.set(-20, 40);
      row.addChild(count);
    }
    if (state === 'open') {
      const pays = label(t('achieve.reward', { jade: g.jade }), 44, COLORS.jade);
      pays.x = 320;
      row.addChild(pays);
    } else {
      const on = state === 'ready';
      const b = button(on ? t('achieve.claim', { jade: g.jade }) : t('tasks.done'), 230, 110, () => on && a.claim(i), {
        fill: on ? COLORS.saffron : COLORS.panelLocked, textFill: on ? COLORS.text : COLORS.dim, size: 40,
      });
      b.x = 320;
      row.addChild(b);
    }
    c.addChild(row);
  });

  const y = top + ROWS_TOP + PER_PAGE * ROW_H - 30;
  const at = label(t('achieve.page', { page: p + 1, pages }), 44, COLORS.dim);
  at.y = y;
  c.addChild(at);
  for (const dir of [-1, 1]) {
    const target = p + dir;
    const ok = target >= 0 && target < pages;
    const b = button(dir < 0 ? '‹' : '›', 140, 110, () => ok && a.page(target), {
      fill: ok ? COLORS.panel : COLORS.panelLocked, textFill: ok ? COLORS.text : COLORS.dim, size: 72,
    });
    b.position.set(dir * 260, y);
    c.addChild(b);
  }
  return c;
}
