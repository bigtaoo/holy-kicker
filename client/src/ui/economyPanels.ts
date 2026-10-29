import { Container, Graphics, type Text } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { today } from '../meta/daily';
import { thisWeek } from '../meta/goals';
import type { Haul } from '../meta/haul';
import { canCollect, canDouble, copperPerHour, patrolDrops, patrolHours, quickLeft } from '../meta/patrol';
import type { SaveData } from '../meta/save';
import { achieveRows, tasksBox, tasksSwitch, type AchievePanelActions, type TasksBox, type TasksView } from './achievePanel';
import { isWideFrame } from './hudLayout';
import { GEAR_TILE, gearTiles, placeTiles } from './gearTiles';
import type { TaoAsset } from '../game/tao/TaoActor';
import { iconSprite, type IconSheet } from './buildBar';
import { PatrolScene, type PatrolArt } from './patrolScene';
import { boardRows } from './taskRows';
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
/** A landscape patrol panel's two halves, this far either side of its middle. */
const WIDE_COL = 460;

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
  // a landscape frame is too short for the column: the road and what it pays on the left, collecting and quick patrols on the right
  const wide = isWideFrame({ w, h });
  const L = wide ? -WIDE_COL : 0;
  const R = wide ? WIDE_COL : 0;
  const boxH = wide ? 960 : 1290 + SCENE_H + 40;
  const top = -boxH / 2;
  const shift = SCENE_H + 40;
  // where the right-hand half starts: under the road, or level with what is stored
  const rTop = wide ? top - 520 - shift + 200 : top;
  box.addChild(panel(wide ? 2 * WIDE_COL + 900 : 920, boxH));
  const title = label(t('patrol.title'), 72);
  title.y = top + 80;
  const stored = label('', 48);
  stored.position.set(L, top + 180);
  const scene = new PatrolScene(SCENE_W, SCENE_H, look.rig, look.art, look.icons);
  scene.view.position.set(L, top + 240);
  ticks.push((dt) => scene.update(dt));
  const gauge = meter(BAR_W, 0, COLORS.saffron);
  gauge.view.position.set(L, top + 260 + shift);
  const pays = label('', 48, COLORS.copper);
  pays.position.set(L, top + 340 + shift);
  const rate = fit(label(t('patrol.rate', { h: P.dropHours, cap: P.capHours }), 48, COLORS.dim), 840, 70);
  rate.position.set(L, top + 410 + shift);
  box.addChild(title, stored, scene.view, gauge.view, pays, rate);
  const refresh = () => {
    const hours = patrolHours(save, now());
    stored.text = t('patrol.stored', { time: hoursText(hours), cap: P.capHours });
    fit(stored, 840);
    gauge.set(hours / P.capHours);
    scene.set(hours, P.capHours, patrolDrops(hours));
    pays.text = t('patrol.pays', { copper: formatAmount(Math.floor(copperPerHour(save) * hours)), n: patrolDrops(hours) });
    fit(pays, 840, 70);
  };
  refresh();
  live.push(refresh);

  // collecting: the ×2 offer matches Collect in size, font and colour (CrazyGames' rewarded-ad rules)
  let y = rTop + 520 + shift;
  const ready = canCollect(save, now());
  if (adOk && canDouble(save, now())) {
    const twice = button(playing ? '…' : t('patrol.double'), 640, 140, () => a.collect(true), {
      fill: playing ? COLORS.panelLocked : COLORS.saffron, video: !playing,
    });
    twice.position.set(R, y);
    box.addChild(twice);
    y += 160;
  }
  const collect = button(t('patrol.collect'), 640, 140, () => (ready ? a.collect(false) : a.toast(t('patrol.tooSoon'))), {
    fill: ready ? COLORS.saffron : COLORS.panelLocked, textFill: ready ? COLORS.text : COLORS.dim,
  });
  collect.position.set(R, y);
  box.addChild(collect);

  y = rTop + 960 + shift;
  const quick = label(t('patrol.quick'), 56);
  quick.position.set(R, y - 100);
  const info = fit(label(t('patrol.quickInfo', { copper: formatAmount(Math.floor(copperPerHour(save) * P.quickHours)), n: P.quickDrops }), 48, COLORS.dim), 840, 70);
  info.position.set(R, y - 35);
  box.addChild(new Graphics().rect(R - 400, y - 160, 800, 4).fill(COLORS.panelLocked), quick, info);
  const adsLeft = quickLeft(save, now(), 'ad');
  const jadeLeft = quickLeft(save, now(), 'jade');
  const buttons: Container[] = [];
  if (adOk) {
    const ok = adsLeft > 0 && !playing;
    buttons.push(button(playing ? '…' : t('patrol.quickAd', { n: adsLeft }), 400, 130, () => (adsLeft > 0 ? a.quick('ad') : a.toast(t('patrol.noneLeft'))), {
      fill: ok ? COLORS.saffron : COLORS.panelLocked, textFill: ok ? COLORS.text : COLORS.dim, video: !playing, size: 48,
    }));
  }
  const jadeOk = jadeLeft > 0 && save.jade >= P.quickJade;
  buttons.push(button(t('patrol.quickJade', { jade: P.quickJade, n: jadeLeft }), 400, 130, () => {
    if (jadeLeft === 0) a.toast(t('patrol.noneLeft'));
    else if (save.jade < P.quickJade) a.toast(t('shop.noJade'));
    else a.quick('jade');
  }, { fill: jadeOk ? COLORS.jade : COLORS.panelLocked, textFill: jadeOk ? COLORS.outline : COLORS.dim, size: 48 }));
  buttons.forEach((b, i) => {
    b.position.set(R + (i - (buttons.length - 1) / 2) * 430, y + 70);
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
  claimGoal(i: number): void;
  weekBonus(): void;
  view(v: TasksView): void;
  close(): void;
}

/** The tasks panel: the Daily / Achievements switch over today's tasks or the achievements. */
export function tasksPanel(save: SaveData, now: number, w: number, h: number, view: TasksView, page: number, a: TasksPanelActions): Container {
  const root = new Container();
  root.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const b = tasksBox(isWideFrame({ w, h }));
  const top = -b.h / 2;
  box.addChild(panel(b.w, b.h));
  const pick = tasksSwitch(save, now, view, b.w, a.view);
  pick.y = top + 85;
  const rows = view === 'daily' ? dailyRows(save, now, b, top, a) : view === 'week' ? weekRows(save, now, b, top, a) : achieveRows(save, page, b, top, a);
  box.addChild(pick, rows);
  const back = button(t('common.back'), 400, 110, a.close, { fill: COLORS.panelLocked });
  back.y = top + b.h - 90;
  box.addChild(back);
  root.addChild(box);
  return root;
}

/** Today's tasks with their progress and Claim, the bonus for claiming them all, from the box top `top`. */
function dailyRows(save: SaveData, now: number, box: TasksBox, top: number, a: TasksPanelActions): Container {
  const D = BALANCE.daily;
  const text = { reward: t('tasks.reward', { copper: D.copper, jade: D.jade }), bonus: t('tasks.bonus', { jade: D.bonusJade }), resets: t('tasks.resets') };
  return boardRows(today(save, now), text, box, top, { claim: a.claimTask, bonus: a.bonus });
}

/** This week's goals, their pay and the chest for claiming them all, from the box top `top`. */
function weekRows(save: SaveData, now: number, box: TasksBox, top: number, a: TasksPanelActions): Container {
  const G = BALANCE.goals;
  const text = { reward: t('tasks.reward', { copper: G.copper, jade: G.jade }), bonus: t('tasks.weekBonus', { chest: t('shop.jade') }), resets: t('tasks.weekResets') };
  return boardRows(thisWeek(save, now), text, box, top, { claim: a.claimGoal, bonus: a.weekBonus });
}

/** What a chest or a patrol just paid, over everything, until OK: the coins in lines, the gear in framed tiles. */
export function haulPanel(haul: Haul, icons: IconSheet, w: number, h: number, close: () => void): Container {
  // text, size, colour and the coin drawn before it
  const lines: [string, number, number, string][] = [];
  if (haul.copper > 0) lines.push([t('haul.copper', { n: formatAmount(haul.copper) }), 56, COLORS.copper, 'copper']);
  if (haul.jade > 0) lines.push([t('haul.jade', { n: formatAmount(haul.jade) }), 56, COLORS.jade, 'jade']);
  if (haul.monk) lines.push([t('haul.monk', { name: t(`monk.${haul.monk}.name`) }), 56, COLORS.gold, `monk_${haul.monk}`]);
  const tiles = new Container();
  const tilesH = placeTiles(gearTiles(haul.drops, icons).map((tile) => tiles.addChild(tile)), 5);
  const root = new Container();
  root.addChild(backdrop(w, h, 0.7));
  const boxH = 160 + lines.reduce((n, [, size]) => n + size + 36, 0) + (tilesH > 0 ? tilesH + 40 : 0) + 200;
  const box = new Container();
  box.position.set(w / 2, h / 2);
  box.addChild(panel(860, boxH));
  let y = -boxH / 2 + 80;
  const title = label(t('haul.title'), 72, COLORS.saffron);
  title.y = y;
  box.addChild(title);
  y += 90;
  for (const [text, size, fill, coin] of lines) {
    const l: Text = fit(label(text, size, fill), 780);
    l.y = y + size / 2;
    box.addChild(l);
    const icon = iconSprite(icons, coin, size * 1.5);
    if (icon) {
      // the coin and the line centred together, a small gap between
      const gap = 16;
      const left = -(icon.width + gap + l.width) / 2;
      icon.position.set(left + icon.width / 2, l.y);
      l.x = left + icon.width + gap + l.width / 2;
      box.addChild(icon);
    }
    y += size + 36;
  }
  if (tilesH > 0) {
    tiles.y = y + 10 + GEAR_TILE / 2;
    box.addChild(tiles);
  }
  const ok = button(t('haul.ok'), 400, 120, close);
  ok.y = boxH / 2 - 100;
  box.addChild(ok);
  root.addChild(box);
  return root;
}
