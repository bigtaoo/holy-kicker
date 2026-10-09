import { Container, Graphics, type Text } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { bonusReady, taskState, today } from '../meta/daily';
import type { Haul } from '../meta/haul';
import { canCollect, canDouble, copperPerHour, patrolDrops, patrolHours, quickLeft } from '../meta/patrol';
import type { SaveData } from '../meta/save';
import { ROWS_TOP, ROW_H, TASKS_BOX_H, achieveRows, tasksSwitch, type AchievePanelActions, type TasksView } from './achievePanel';
import { dropLines } from './gearText';
import type { TaoAsset } from '../game/tao/TaoActor';
import type { IconSheet } from './buildBar';
import { PatrolScene, type PatrolArt } from './patrolScene';
import { COLORS, backdrop, button, fit, label, meter, panel } from './widgets';

// The lobby's modal panels for the patrol, the daily tasks (achievements: achievePanel.ts) and
// what a chest or a patrol paid.
// Builders only: the state and the paying live in lobbyEconomy.ts. Panels that show the
// patrol's running time hand back refreshers, called every second while they are up.

/** Something that redraws a live number in place. */
export type Live = () => void;
/** Something animated, advanced every frame by the seconds since the last. */
export type Tick = (dt: number) => void;

/** What the patrol panel's scene is drawn with: the chosen monk's rig, the road art, the icons. */
export interface PatrolLook {
  rig: TaoAsset;
  art: PatrolArt | null;
  icons: IconSheet;
}

const SCENE_W = 840;
const SCENE_H = 300;

const BAR_W = 760;

/** Hours as "3h 12m". */
export function hoursText(hours: number): string {
  const h = Math.floor(hours);
  return t('patrol.time', { h, m: Math.floor((hours - h) * 60) });
}

export interface PatrolPanelActions {
  collect(double: boolean): void;
  quick(pay: 'ad' | 'jade'): void;
  close(): void;
  toast(text: string): void;
}

/**
 * The patrol: the monk on the road (patrolScene.ts), time piled up, what it pays so far,
 * collect (and ×2 with an ad), quick patrols.
 */
export function patrolPanel(save: SaveData, now: () => number, w: number, h: number, adOk: boolean, playing: boolean, a: PatrolPanelActions, look: PatrolLook, live: Live[], ticks: Tick[]): Container {
  const P = BALANCE.patrol;
  const root = new Container();
  root.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const boxH = 1290 + SCENE_H + 40;
  const top = -boxH / 2;
  box.addChild(panel(920, boxH));
  const title = label(t('patrol.title'), 72);
  title.y = top + 80;
  const stored = label('', 48);
  stored.y = top + 180;
  const scene = new PatrolScene(SCENE_W, SCENE_H, look.rig, look.art, look.icons);
  scene.view.y = top + 240;
  ticks.push((dt) => scene.update(dt));
  const shift = SCENE_H + 40;
  const gauge = meter(BAR_W, 0, COLORS.saffron);
  gauge.view.y = top + 260 + shift;
  const pays = label('', 44, COLORS.copper);
  pays.y = top + 340 + shift;
  const rate = fit(label(t('patrol.rate', { h: P.dropHours, cap: P.capHours }), 40, COLORS.dim), 840);
  rate.y = top + 410 + shift;
  box.addChild(title, stored, scene.view, gauge.view, pays, rate);
  const refresh = () => {
    const hours = patrolHours(save, now());
    stored.text = t('patrol.stored', { time: hoursText(hours), cap: P.capHours });
    fit(stored, 840);
    gauge.set(hours / P.capHours);
    scene.set(hours, P.capHours, patrolDrops(hours));
    pays.text = t('patrol.pays', { copper: formatAmount(Math.floor(copperPerHour(save) * hours)), n: patrolDrops(hours) });
    fit(pays, 840);
  };
  refresh();
  live.push(refresh);

  // collecting: the ×2 offer matches Collect in size, font and colour (CrazyGames' rewarded-ad rules)
  let y = top + 520 + shift;
  const ready = canCollect(save, now());
  if (adOk && canDouble(save, now())) {
    const twice = button(playing ? '…' : t('patrol.double'), 640, 140, () => a.collect(true), {
      fill: playing ? COLORS.panelLocked : COLORS.saffron, video: !playing,
    });
    twice.y = y;
    box.addChild(twice);
    y += 160;
  }
  const collect = button(t('patrol.collect'), 640, 140, () => (ready ? a.collect(false) : a.toast(t('patrol.tooSoon'))), {
    fill: ready ? COLORS.saffron : COLORS.panelLocked, textFill: ready ? COLORS.text : COLORS.dim,
  });
  collect.y = y;
  box.addChild(collect);

  y = top + 960 + shift;
  const quick = label(t('patrol.quick'), 56);
  quick.y = y - 100;
  const info = fit(label(t('patrol.quickInfo', { copper: formatAmount(Math.floor(copperPerHour(save) * P.quickHours)), n: P.quickDrops }), 40, COLORS.dim), 840);
  info.y = y - 35;
  box.addChild(new Graphics().rect(-400, y - 160, 800, 4).fill(COLORS.panelLocked), quick, info);
  const adsLeft = quickLeft(save, now(), 'ad');
  const jadeLeft = quickLeft(save, now(), 'jade');
  const buttons: Container[] = [];
  if (adOk) {
    const ok = adsLeft > 0 && !playing;
    buttons.push(button(playing ? '…' : t('patrol.quickAd', { n: adsLeft }), 400, 130, () => (adsLeft > 0 ? a.quick('ad') : a.toast(t('patrol.noneLeft'))), {
      fill: ok ? COLORS.saffron : COLORS.panelLocked, textFill: ok ? COLORS.text : COLORS.dim, video: !playing, size: 44,
    }));
  }
  const jadeOk = jadeLeft > 0 && save.jade >= P.quickJade;
  buttons.push(button(t('patrol.quickJade', { jade: P.quickJade, n: jadeLeft }), 400, 130, () => {
    if (jadeLeft === 0) a.toast(t('patrol.noneLeft'));
    else if (save.jade < P.quickJade) a.toast(t('shop.noJade'));
    else a.quick('jade');
  }, { fill: jadeOk ? COLORS.jade : COLORS.panelLocked, textFill: jadeOk ? COLORS.outline : COLORS.dim, size: 44 }));
  buttons.forEach((b, i) => {
    b.position.set((i - (buttons.length - 1) / 2) * 430, y + 70);
    box.addChild(b);
  });
  const back = button(t('common.back'), 400, 110, a.close, { fill: COLORS.panelLocked });
  back.y = top + boxH - 90;
  box.addChild(back);
  // nothing answers taps while the ad plays
  box.interactiveChildren = !playing;
  root.addChild(box);
  return root;
}

export interface TasksPanelActions extends AchievePanelActions {
  claimTask(i: number): void;
  bonus(): void;
  view(v: TasksView): void;
  close(): void;
}

/** The tasks panel: the Daily / Achievements switch over today's tasks or the achievements. */
export function tasksPanel(save: SaveData, now: number, w: number, h: number, view: TasksView, page: number, a: TasksPanelActions): Container {
  const root = new Container();
  root.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const top = -TASKS_BOX_H / 2;
  box.addChild(panel(960, TASKS_BOX_H));
  const pick = tasksSwitch(save, now, view, a.view);
  pick.y = top + 85;
  box.addChild(pick, view === 'daily' ? dailyRows(save, now, top, a) : achieveRows(save, page, top, a));
  const back = button(t('common.back'), 400, 110, a.close, { fill: COLORS.panelLocked });
  back.y = top + TASKS_BOX_H - 90;
  box.addChild(back);
  root.addChild(box);
  return root;
}

/** Today's tasks with their progress and Claim, the bonus for claiming them all, from the box top `top`. */
function dailyRows(save: SaveData, now: number, top: number, a: TasksPanelActions): Container {
  const D = BALANCE.daily;
  const d = today(save, now);
  const c = new Container();
  const reward = fit(label(t('tasks.reward', { copper: D.copper, jade: D.jade }), 40, COLORS.dim), 880);
  reward.y = top + 215;
  c.addChild(reward);
  D.tasks.forEach((goal, i) => {
    const row = new Container();
    row.y = top + ROWS_TOP + i * ROW_H;
    const state = taskState(save, d, i);
    const name = fit(label(t(`tasks.${goal.kind}`, { n: goal.n }), 46, state === 'claimed' || state === 'locked' ? COLORS.dim : COLORS.text, { align: 'left' }), 560);
    name.anchor.set(0, 0.5);
    name.position.set(-430, -30);
    if (state === 'locked') {
      // the patrol opens later; until then its task says when, and the bonus skips it
      const when = fit(label(t('tab.unlockChapter', { n: BALANCE.unlocks.patrolChapter }), 40, COLORS.danger, { align: 'left' }), 860);
      when.anchor.set(0, 0.5);
      when.position.set(-430, 40);
      row.addChild(name, when);
      c.addChild(row);
      return;
    }
    const done = Math.min(goal.n, d.progress[i]);
    const gauge = meter(380, done / goal.n, state === 'open' ? COLORS.copper : COLORS.jade);
    gauge.view.position.set(-240, 40);
    const count = label(`${done}/${goal.n}`, 42, COLORS.dim);
    count.anchor.set(0, 0.5);
    count.position.set(-20, 40);
    row.addChild(name, gauge.view, count);
    if (state !== 'open') {
      const ready = state === 'ready';
      const b = button(ready ? t('tasks.claim') : t('tasks.done'), 230, 110, () => ready && a.claimTask(i), {
        fill: ready ? COLORS.saffron : COLORS.panelLocked, textFill: ready ? COLORS.text : COLORS.dim, size: 44,
      });
      b.x = 320;
      row.addChild(b);
    }
    c.addChild(row);
  });
  const ready = bonusReady(save, d);
  const bonus = button(t('tasks.bonus', { jade: D.bonusJade }), 760, 130, () => ready && a.bonus(), {
    fill: ready ? COLORS.jade : COLORS.panelLocked, textFill: ready ? COLORS.outline : COLORS.dim, size: 48,
  });
  bonus.y = top + ROWS_TOP + D.tasks.length * ROW_H + 10;
  const resets = label(t('tasks.resets'), 38, COLORS.dim);
  resets.y = bonus.y + 110;
  c.addChild(bonus, resets);
  return c;
}

/** What a chest or a patrol just paid, over everything, until OK. */
export function haulPanel(haul: Haul, w: number, h: number, close: () => void): Container {
  const lines: [string, number, number][] = [];
  if (haul.copper > 0) lines.push([t('haul.copper', { n: formatAmount(haul.copper) }), 56, COLORS.copper]);
  if (haul.jade > 0) lines.push([t('haul.jade', { n: formatAmount(haul.jade) }), 56, COLORS.jade]);
  for (const [text, color] of dropLines(haul.drops)) lines.push([text, 48, color]);
  const root = new Container();
  root.addChild(backdrop(w, h, 0.7));
  const boxH = 160 + lines.reduce((n, [, size]) => n + size + 36, 0) + 200;
  const box = new Container();
  box.position.set(w / 2, h / 2);
  box.addChild(panel(860, boxH));
  let y = -boxH / 2 + 80;
  const title = label(t('haul.title'), 72, COLORS.saffron);
  title.y = y;
  box.addChild(title);
  y += 90;
  for (const [text, size, fill] of lines) {
    const l: Text = fit(label(text, size, fill), 780);
    l.y = y + size / 2;
    box.addChild(l);
    y += size + 36;
  }
  const ok = button(t('haul.ok'), 400, 120, close);
  ok.y = boxH / 2 - 100;
  box.addChild(ok);
  root.addChild(box);
  return root;
}
