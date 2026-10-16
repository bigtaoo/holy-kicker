import { Container } from 'pixi.js';
import { t } from '../i18n';
import type { DownInfo, Goal } from './deathInfo';
import { fallIcon } from './fallIcons';
import type { UiFrame } from './uiLayout';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The death panel: "You fell", what did it with a picture and one tip for next time, the nearest
// goal the run fell short of, then the revive (free from training or with an ad) and the way out.

/** Death panel: no revive to offer, a free one (training), the ad offered, or the ad playing. */
export type Down = 'none' | 'free' | 'offered' | 'playing';

export interface DownActions {
  revive(): void;
  giveUp(): void;
}

const W = 940;
const TEXT_W = W - 120;

function goalText(goal: Goal): string {
  return goal.kind === 'clear' ? t('run.goal.clear', { n: goal.n }) : t(`run.goal.${goal.kind}`, { n: goal.n, wave: goal.wave });
}

export function downPanel(f: UiFrame, down: Down, info: DownInfo | null, wave: number, actions: DownActions): Container {
  const layer = new Container();
  layer.addChild(backdrop(f.w, f.h));
  // stacked top down: [view, height it takes]
  const items: [Container, number][] = [[label(t('run.down'), 80, COLORS.text), 120]];
  if (info) {
    const icon = fallIcon(info.cause);
    items.push([icon, 200]);
    items.push([fit(label(t(`run.fall.${info.cause}.cause`, { wave }), 56, COLORS.saffron), TEXT_W), 80]);
    const tip = label(t(`run.fall.${info.cause}.tip`), 48, COLORS.text, { wordWrap: true, wordWrapWidth: TEXT_W, breakWords: true, lineHeight: 60 });
    items.push([tip, tip.height + 30]);
    if (info.goal) {
      const goal = label(goalText(info.goal), 48, info.goal.kind === 'record' ? COLORS.jade : COLORS.trim, { wordWrap: true, wordWrapWidth: TEXT_W, breakWords: true });
      items.push([goal, goal.height + 40]);
    }
  }
  // the way out matches the revive in size, font and colour, so declining the ad never looks
  // disabled (CrazyGames' rewarded-ad rules)
  const giveUp = button(t('run.giveUp'), 640, 150, () => actions.giveUp());
  if (down !== 'none') {
    const playing = down === 'playing';
    const free = down === 'free';
    const revive = button(playing ? '…' : free ? t('run.reviveFree') : t('run.revive'), 640, 150, () => actions.revive(), {
      fill: playing ? COLORS.panelLocked : COLORS.saffron,
      video: !playing && !free,
    });
    if (playing) revive.eventMode = giveUp.eventMode = 'none';
    items.push([revive, 190]);
  }
  items.push([giveUp, 190]);
  const h = items.reduce((sum, [, step]) => sum + step, 0) + 80;
  const box = new Container();
  box.position.set(f.w / 2, f.h / 2);
  box.addChild(panel(W, h));
  let y = -h / 2 + 40;
  for (const [view, step] of items) {
    view.y = y + step / 2;
    box.addChild(view);
    y += step;
  }
  layer.addChild(box);
  return layer;
}
