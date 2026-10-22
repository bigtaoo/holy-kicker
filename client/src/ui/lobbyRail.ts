import { Container, Graphics, type Text } from 'pixi.js';
import { lockedLook } from './buildBar';
import { BADGE } from './playCard';
import { COLORS, dot, fit, label, playTap, shade } from './widgets';

// The round buttons down the Play tab's two sides (docs/design.md "Lobby layout"): Patrol and
// Tasks on the left, the daily challenge and the welcome gift on the right. Every one is the same
// light badge with its picture, its name under it and a short line under that, so the side things
// read as one quiet family and PLAY stays the only loud button on the screen.

export const RAIL_R = 72;
/** From a rail button's centre to the next one's. */
export const RAIL_STEP = 300;
/** The labels' width: they may run a little past the badge, never off the screen. */
const TEXT_W = 230;
const LIP = 10;

export interface RailOptions {
  icon: Container | null;
  name: string;
  /** The short line under the name (time left, what is ready); empty for none. */
  sub?: string;
  /** A saffron ring: something here wants the player now. */
  lit?: boolean;
  /** Greyed: locked, or done for today. */
  dim?: boolean;
  dot?: boolean;
}

export interface Rail {
  view: Container;
  /** The line under the name, for a live countdown. */
  sub: Text;
  dot: Graphics;
}

export function railButton(o: RailOptions, onTap: () => void): Rail {
  const view = new Container();
  const fill = o.dim ? BADGE.off : BADGE.fill;
  const base = new Graphics()
    .circle(0, LIP + 6, RAIL_R).fill({ color: 0x000000, alpha: 0.3 })
    .circle(0, LIP, RAIL_R).fill(shade(fill, -0.35)).stroke({ color: COLORS.outline, width: 7 });
  const top = new Container();
  const face = new Graphics().circle(0, 0, RAIL_R).fill(fill).stroke({ color: o.lit ? COLORS.saffron : COLORS.outline, width: o.lit ? 9 : 7 });
  face.circle(0, 0, RAIL_R - 14).stroke({ color: shade(fill, -0.12), width: 3 });
  top.addChild(face);
  if (o.icon) {
    if (o.dim) lockedLook(o.icon);
    top.addChild(o.icon);
  }
  const stroke = { stroke: { color: COLORS.outline, width: 9 } };
  const name = fit(label(o.name, 48, o.dim ? COLORS.dim : COLORS.text, stroke), TEXT_W);
  name.y = RAIL_R + LIP + 30;
  const sub = fit(label(o.sub ?? '', 48, o.lit ? COLORS.saffron : COLORS.text, stroke), TEXT_W);
  sub.y = name.y + 52;
  const d = dot(RAIL_R * 0.7, -RAIL_R * 0.7);
  d.visible = !!o.dot;
  top.addChild(d);
  view.addChild(base, top, name, sub);
  view.eventMode = 'static';
  view.cursor = 'pointer';
  view.hitArea = { contains: (x: number, y: number) => x * x + y * y <= (RAIL_R + 16) ** 2 || (Math.abs(x) <= TEXT_W / 2 && y > 0 && y <= sub.y + 28) };
  let down = false;
  const press = (on: boolean) => (top.y = on ? LIP * 0.7 : 0);
  view.on('pointerdown', () => {
    down = true;
    press(true);
  });
  const reset = () => {
    down = false;
    press(false);
  };
  view.on('pointerupoutside', reset);
  view.on('pointerleave', reset);
  view.on('pointerup', () => {
    const fire = down;
    reset();
    if (fire) {
      playTap();
      onTap();
    }
  });
  return { view, sub, dot: d };
}

/** Resets a rail button's line, keeping it inside the labels' width. */
export function setRailSub(r: Rail, text: string): void {
  r.sub.scale.set(1);
  r.sub.text = text;
  fit(r.sub, TEXT_W);
}
