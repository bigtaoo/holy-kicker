import { Container } from 'pixi.js';
import { t } from '../i18n';
import { boardBonusReady, boardState, type Board, type Task, type TaskKind } from '../meta/taskPool';
import { rowSpot, rowsEnd, type TasksBox } from './achievePanel';
import { COLORS, button, fit, label, meter } from './widgets';

// The rows of a task board (the day's tasks, the week's goals): each task with its progress and
// Claim, the bonus for claiming them all and when the board resets.

/** What a task asks for, in words. */
export function taskText(task: Task): string {
  const name = task.kind === 'relic' ? t(`relic.${task.id as 'staff'}.name`) : task.kind === 'monk' ? t(`monk.${task.id as 'novice'}.name`) : '';
  return t(`tasks.${task.kind as Exclude<TaskKind, 'daily'>}`, { n: task.n, name });
}

/** What a board shows besides its tasks: the pay line, the bonus button's text and the reset line. */
export interface BoardText {
  reward: string;
  bonus: string;
  resets: string;
}

export interface BoardActions {
  claim(i: number): void;
  bonus(): void;
}

/** A board's rows in the tasks panel's box, from the box top `top`. */
export function boardRows(b: Board, text: BoardText, box: TasksBox, top: number, a: BoardActions): Container {
  const c = new Container();
  const reward = fit(label(text.reward, 48, COLORS.dim), 880, 130);
  reward.y = top + 215;
  c.addChild(reward);
  b.tasks.forEach((task, i) => {
    const row = new Container();
    const spot = rowSpot(box, i, top);
    row.position.set(spot.x, spot.y);
    const state = boardState(b, i);
    const n = task.n;
    const name = fit(label(taskText(task), 48, state === 'claimed' ? COLORS.dim : COLORS.text, { align: 'left' }), 560, 70);
    name.anchor.set(0, 0.5);
    name.position.set(-430, -30);
    const done = Math.min(n, b.progress[i]);
    const gauge = meter(380, done / n, state === 'open' ? COLORS.copper : COLORS.jade);
    gauge.view.position.set(-240, 40);
    const count = label(`${done}/${n}`, 48, COLORS.dim);
    count.anchor.set(0, 0.5);
    count.position.set(-20, 40);
    row.addChild(name, gauge.view, count);
    if (state !== 'open') {
      const ready = state === 'ready';
      const claim = button(ready ? t('tasks.claim') : t('tasks.done'), 230, 110, () => ready && a.claim(i), {
        fill: ready ? COLORS.saffron : COLORS.panelLocked, textFill: ready ? COLORS.text : COLORS.dim, size: 48,
      });
      claim.x = 320;
      row.addChild(claim);
    }
    c.addChild(row);
  });
  const ready = boardBonusReady(b);
  const bonus = button(text.bonus, 760, 130, () => ready && a.bonus(), {
    fill: ready ? COLORS.jade : COLORS.panelLocked, textFill: ready ? COLORS.outline : COLORS.dim, size: 48,
  });
  bonus.y = rowsEnd(box, b.tasks.length, top) + 10;
  const resets = fit(label(text.resets, 48, COLORS.dim), 880, 130);
  resets.y = bonus.y + 110;
  c.addChild(bonus, resets);
  return c;
}
