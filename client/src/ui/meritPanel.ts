import { Container } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { meritWaiting, stepCopper, thisSeason, untilNextSeason } from '../meta/merit';
import type { SaveData } from '../meta/save';
import type { TasksBox } from './achievePanel';
import { iconSprite, type IconSheet } from './buildBar';
import { COLORS, button, fit, label, meter, panel } from './widgets';

// The merit page of the tasks panel (meta/merit.ts): the season's points and how long it has
// left, the track as a grid of tiles (what each step pays, at how many points), and one Claim for
// every step reached. Builders only, like economyPanels.ts.

const TILE_H = 180;
/** Tiles across: four on a portrait box (five lines), ten on a wide one (two lines). */
const columns = (box: TasksBox) => (box.head > 0 ? 4 : 10);

/** What step `i` pays, as the icon to draw and the amount under it. */
function stepPay(save: SaveData, i: number): [string, string] {
  const s = BALANCE.merit.steps[i];
  if (s.drops) return ['chest', `×${s.drops}`];
  if (s.jade) return ['jade', formatAmount(s.jade)];
  return ['copper', formatAmount(stepCopper(save, i))];
}

/** The merit page from the box top `top`; `claim` pays every step reached. */
export function meritRows(save: SaveData, now: number, box: TasksBox, top: number, icons: IconSheet, claim: () => void): Container {
  const M = BALANCE.merit;
  const c = new Container();
  const m = thisSeason(save, now);
  const y0 = top + box.head;
  const points = fit(label(t('merit.points', { n: formatAmount(m.points) }), 56, COLORS.saffron), 880);
  points.y = y0 + 195;
  const left = untilNextSeason(now);
  const d = Math.floor(left / (24 * 3600 * 1000));
  const ends = fit(label(t('merit.ends', { d, h: Math.floor(left / (3600 * 1000)) % 24 }), 48, COLORS.dim), 880);
  ends.y = y0 + 260;
  const earn = fit(label(t('merit.earn', { task: M.points.task, goal: M.points.goal }), 48, COLORS.dim), box.w - 80);
  earn.y = y0 + 325;
  c.addChild(points, ends, earn);

  const cols = columns(box);
  const pitch = Math.min(230, (box.w - 60) / cols);
  const tileW = pitch - 16;
  M.steps.forEach((step, i) => {
    const claimed = (m.claimed & (1 << i)) !== 0;
    const reached = step.at <= m.points;
    const tile = new Container();
    tile.position.set((i % cols - (cols - 1) / 2) * pitch, y0 + 470 + Math.floor(i / cols) * (TILE_H + 10));
    tile.addChild(panel(tileW, TILE_H, reached && !claimed ? COLORS.saffron : COLORS.panelLocked, 20));
    const at = fit(label(formatAmount(step.at), 48, reached && !claimed ? COLORS.text : COLORS.dim), tileW - 20);
    at.y = -54;
    const [icon, amount] = stepPay(save, i);
    const sprite = iconSprite(icons, icon, 64);
    if (sprite) {
      sprite.y = 2;
      tile.addChild(sprite);
    }
    // on a saffron tile the amount reads in the text colour, as copper and jade would sink into it
    const tint = reached && !claimed ? COLORS.text : icon === 'jade' ? COLORS.jade : icon === 'copper' ? COLORS.copper : COLORS.text;
    const pays = fit(label(amount, 48, tint), tileW - 20);
    pays.y = 56;
    tile.addChild(at, pays);
    // a paid step fades back, so what is still ahead stands out
    if (claimed) tile.alpha = 0.4;
    c.addChild(tile);
  });

  // how far along the step after the last reached one
  const next = M.steps.find((s) => s.at > m.points);
  const prev = [...M.steps].reverse().find((s) => s.at <= m.points)?.at ?? 0;
  const waiting = meritWaiting(m).length;
  const y = top + box.h - 230;
  if (waiting > 0) {
    const b = button(t('merit.claim', { n: waiting }), 760, 120, claim, { fill: COLORS.saffron, size: 48 });
    b.y = y;
    c.addChild(b);
  } else if (next) {
    const gauge = meter(640, (m.points - prev) / (next.at - prev), COLORS.saffron);
    gauge.view.y = y - 30;
    const text = label(t('merit.next', { n: formatAmount(next.at) }), 48, COLORS.dim);
    text.y = y + 30;
    c.addChild(gauge.view, text);
  } else {
    const done = label(t('merit.done'), 48, COLORS.dim);
    done.y = y;
    c.addChild(done);
  }
  return c;
}
