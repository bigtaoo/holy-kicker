import { Container, type Text } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import type { Haul } from '../meta/haul';
import { iconSprite, type IconSheet } from './buildBar';
import { GEAR_TILE, GEAR_TILE_STEP, gearTiles } from './gearTiles';
import { dropLines } from './gearText';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// What a chest, the gift or a patrol just paid, over everything until OK: the coins in lines and
// each piece of gear as a row, its tile and its name in its rarity's colour ("Rare Gauntlets"),
// so a newcomer sees what he got and how good it is. The box pops in and the rows follow one by
// one; the pop's clock lives with the caller, so a relayout does not start it again.

/** Seconds: the box's pop, then the wait between two rows coming in, and a row's fade. */
export const POP = 0.22;
export const ROW_STEP = 0.09;
export const ROW_FADE = 0.16;

/** The box's scale `age` seconds after it opened: a quick overshoot that settles on 1. */
export function popScale(age: number): number {
  if (age >= POP) return 1;
  const k = Math.max(0, age) / POP;
  // easeOutBack
  const c = 1.7;
  const u = k - 1;
  return 0.6 + 0.4 * (1 + (c + 1) * u * u * u + c * u * u);
}

/** Row `i`'s opacity at `age`: each one comes in after the box and the rows before it. */
export function rowAlpha(i: number, age: number): number {
  return Math.max(0, Math.min(1, (age - POP - i * ROW_STEP) / ROW_FADE));
}

export interface HaulView {
  view: Container;
  /** Poses the box and its rows for `age` seconds since it opened. */
  pop(age: number): void;
}

const BOX_W = 860;
/** A gear row's name runs this wide, right of its tile. */
const NAME_W = BOX_W - GEAR_TILE - 140;

export function haulPanel(haul: Haul, icons: IconSheet, w: number, h: number, close: () => void): HaulView {
  // text, size, colour and the coin drawn before it
  const lines: [string, number, number, string][] = [];
  if (haul.copper > 0) lines.push([t('haul.copper', { n: formatAmount(haul.copper) }), 56, COLORS.copper, 'copper']);
  if (haul.jade > 0) lines.push([t('haul.jade', { n: formatAmount(haul.jade) }), 56, COLORS.jade, 'jade']);
  if (haul.monk) lines.push([t('haul.monk', { name: t(`monk.${haul.monk}.name`) }), 56, COLORS.gold, `monk_${haul.monk}`]);
  // the tiles and their names come grouped and ordered alike (best first)
  const tiles = gearTiles(haul.drops, icons);
  const names = dropLines(haul.drops);
  const gearH = tiles.length * GEAR_TILE_STEP;
  const root = new Container();
  root.addChild(backdrop(w, h, 0.7));
  const boxH = 160 + lines.reduce((n, [, size]) => n + size + 36, 0) + (gearH > 0 ? gearH + 20 : 0) + 200;
  const box = new Container();
  box.position.set(w / 2, h / 2);
  box.addChild(panel(BOX_W, boxH));
  let y = -boxH / 2 + 80;
  const title = label(t('haul.title'), 72, COLORS.saffron);
  title.y = y;
  box.addChild(title);
  y += 90;
  const rows: Container[] = [];
  for (const [text, size, fill, coin] of lines) {
    const row = new Container();
    const l: Text = fit(label(text, size, fill), 780);
    l.y = y + size / 2;
    row.addChild(l);
    const icon = iconSprite(icons, coin, size * 1.5);
    if (icon) {
      // the coin and the line centred together, a small gap between
      const gap = 16;
      const left = -(icon.width + gap + l.width) / 2;
      icon.position.set(left + icon.width / 2, l.y);
      l.x = left + icon.width + gap + l.width / 2;
      row.addChild(icon);
    }
    rows.push(box.addChild(row));
    y += size + 36;
  }
  // each piece of gear a row: the tile on the left, its rarity and name beside it
  tiles.forEach((tile, i) => {
    const row = new Container();
    const cy = y + 10 + GEAR_TILE / 2 + i * GEAR_TILE_STEP;
    const [text, color] = names[i] ?? ['', COLORS.text];
    const name = fit(label(text, 48, color, { stroke: { color: COLORS.outline, width: 6 } }), NAME_W);
    const left = -(GEAR_TILE + 30 + name.width) / 2;
    tile.position.set(left + GEAR_TILE / 2, cy);
    name.anchor.set(0, 0.5);
    name.position.set(left + GEAR_TILE + 30, cy);
    row.addChild(tile, name);
    rows.push(box.addChild(row));
  });
  const ok = button(t('haul.ok'), 400, 120, close);
  ok.y = boxH / 2 - 100;
  box.addChild(ok);
  root.addChild(box);
  return {
    view: root,
    pop(age) {
      if (box.destroyed) return;
      box.scale.set(popScale(age));
      rows.forEach((r, i) => {
        r.alpha = rowAlpha(i, age);
      });
    },
  };
}
