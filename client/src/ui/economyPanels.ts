import { Container, Graphics, type Text } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { bonusReady, taskState, today } from '../meta/daily';
import type { Haul } from '../meta/haul';
import { canCollect, canDouble, copperPerHour, patrolDrops, patrolHours, quickLeft } from '../meta/patrol';
import type { SaveData } from '../meta/save';
import { dropLines } from './gearText';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The lobby's modal panels for the patrol, the daily tasks and what a chest or a patrol paid.
// Builders only: the state and the paying live in lobbyEconomy.ts. Panels that show the
// patrol's running time hand back refreshers, called every second while they are up.

/** Something that redraws a live number in place. */
export type Live = () => void;

const BAR_W = 760;

/** Hours as "3h 12m". */
export function hoursText(hours: number): string {
  const h = Math.floor(hours);
  return t('patrol.time', { h, m: Math.floor((hours - h) * 60) });
}

/** A horizontal bar centred on x = 0, filled to `share`; returns its fill to update. */
function bar(w: number, share: number, color: number): { view: Container; set(share: number): void } {
  const view = new Container();
  const back = new Graphics().roundRect(-w / 2 - 6, -20, w + 12, 40, 14).fill(COLORS.outline);
  const fill = new Graphics().roundRect(0, 0, w, 28, 10).fill(color);
  fill.position.set(-w / 2, -14);
  view.addChild(back, fill);
  const set = (s: number) => {
    fill.scale.x = Math.max(0.001, Math.min(1, s));
  };
  set(share);
  return { view, set };
}

export interface PatrolPanelActions {
  collect(double: boolean): void;
  quick(pay: 'ad' | 'jade'): void;
  close(): void;
  toast(text: string): void;
}

/** The patrol: time piled up, what it pays so far, collect (and ×2 with an ad), quick patrols. */
export function patrolPanel(save: SaveData, now: () => number, w: number, h: number, adOk: boolean, playing: boolean, a: PatrolPanelActions, live: Live[]): Container {
  const P = BALANCE.patrol;
  const root = new Container();
  root.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const boxH = 1290;
  const top = -boxH / 2;
  box.addChild(panel(920, boxH));
  const title = label(t('patrol.title'), 72);
  title.y = top + 80;
  const stored = label('', 48);
  stored.y = top + 180;
  const meter = bar(BAR_W, 0, COLORS.saffron);
  meter.view.y = top + 260;
  const pays = label('', 44, COLORS.copper);
  pays.y = top + 340;
  const rate = fit(label(t('patrol.rate', { h: P.dropHours, cap: P.capHours }), 40, COLORS.dim), 840);
  rate.y = top + 410;
  box.addChild(title, stored, meter.view, pays, rate);
  const refresh = () => {
    const hours = patrolHours(save, now());
    stored.text = t('patrol.stored', { time: hoursText(hours), cap: P.capHours });
    fit(stored, 840);
    meter.set(hours / P.capHours);
    pays.text = t('patrol.pays', { copper: formatAmount(Math.floor(copperPerHour(save) * hours)), n: patrolDrops(hours) });
    fit(pays, 840);
  };
  refresh();
  live.push(refresh);

  // collecting: the ×2 offer matches Collect in size, font and colour (CrazyGames' rewarded-ad rules)
  let y = top + 520;
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

  y = top + 960;
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

export interface TasksPanelActions {
  claim(i: number): void;
  bonus(): void;
  close(): void;
}

const ROW_H = 170;

/** Today's tasks with their progress and Claim, the bonus for claiming them all. */
export function tasksPanel(save: SaveData, now: number, w: number, h: number, a: TasksPanelActions): Container {
  const D = BALANCE.daily;
  const d = today(save, now);
  const root = new Container();
  root.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const boxH = 300 + D.tasks.length * ROW_H + 340;
  const top = -boxH / 2;
  box.addChild(panel(960, boxH));
  const title = label(t('tasks.title'), 72);
  title.y = top + 80;
  const reward = fit(label(t('tasks.reward', { copper: D.copper, jade: D.jade }), 40, COLORS.dim), 880);
  reward.y = top + 170;
  box.addChild(title, reward);
  D.tasks.forEach((goal, i) => {
    const row = new Container();
    row.y = top + 300 + i * ROW_H;
    const state = taskState(d, i);
    const name = fit(label(t(`tasks.${goal.kind}`, { n: goal.n }), 46, state === 'claimed' ? COLORS.dim : COLORS.text, { align: 'left' }), 560);
    name.anchor.set(0, 0.5);
    name.position.set(-430, -30);
    const done = Math.min(goal.n, d.progress[i]);
    const meter = bar(380, done / goal.n, state === 'open' ? COLORS.copper : COLORS.jade);
    meter.view.position.set(-240, 40);
    const count = label(`${done}/${goal.n}`, 42, COLORS.dim);
    count.anchor.set(0, 0.5);
    count.position.set(-20, 40);
    row.addChild(name, meter.view, count);
    if (state !== 'open') {
      const ready = state === 'ready';
      const b = button(ready ? t('tasks.claim') : t('tasks.done'), 230, 110, () => ready && a.claim(i), {
        fill: ready ? COLORS.saffron : COLORS.panelLocked, textFill: ready ? COLORS.text : COLORS.dim, size: 44,
      });
      b.x = 320;
      row.addChild(b);
    }
    box.addChild(row);
  });
  const ready = bonusReady(d);
  const bonus = button(t('tasks.bonus', { jade: D.bonusJade }), 760, 130, () => ready && a.bonus(), {
    fill: ready ? COLORS.jade : COLORS.panelLocked, textFill: ready ? COLORS.outline : COLORS.dim, size: 48,
  });
  bonus.y = top + 300 + D.tasks.length * ROW_H + 10;
  const resets = label(t('tasks.resets'), 38, COLORS.dim);
  resets.y = bonus.y + 110;
  const back = button(t('common.back'), 400, 110, a.close, { fill: COLORS.panelLocked });
  back.y = top + boxH - 90;
  box.addChild(bonus, resets, back);
  root.addChild(box);
  return root;
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
