import { Graphics } from 'pixi.js';
import type { DeathCause } from './deathInfo';
import { COLORS, shade } from './widgets';

// The death panel's picture of what went wrong and what to do instead, in the figures' sticker
// style: flat colours, a thick dark outline, one hard shadow. The hero is saffron, foes cold with
// red eyes, danger red and the way out a white arrow. About 240 x 170 units, centred.

const LINE = 7;
const HERO = COLORS.saffron;
const FOE = 0x4f8f96;
const BIG_FOE = 0x6c4f9a;
const EYE = 0xff3030;
const DANGER = COLORS.danger;
const MOVE = COLORS.text;
const GEM = 0x7fd8ff;

/** A round figure with its hard cel shadow on the lower right. */
function body(g: Graphics, x: number, y: number, r: number, fill: number): void {
  g.circle(x, y, r).fill(fill);
  g.arc(x, y, r, -0.15 * Math.PI, 0.85 * Math.PI).closePath().fill(shade(fill, -0.3));
  g.circle(x, y, r).stroke({ color: COLORS.outline, width: LINE });
}

function hero(g: Graphics, x: number, y: number, r = 26): void {
  body(g, x, y, r, HERO);
}

function foe(g: Graphics, x: number, y: number, r: number, fill = FOE): void {
  body(g, x, y, r, fill);
  const e = r * 0.32;
  for (const sx of [-1, 1]) g.circle(x + sx * e, y - r * 0.15, Math.max(3, r * 0.14)).fill(EYE);
}

/** A thick outlined arrow from (x0, y0) to (x1, y1). */
function arrow(g: Graphics, x0: number, y0: number, x1: number, y1: number, color = MOVE, w = 12): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const head = w * 2;
  const bx = x1 - Math.cos(a) * head;
  const by = y1 - Math.sin(a) * head;
  const nx = -Math.sin(a) * head * 0.8;
  const ny = Math.cos(a) * head * 0.8;
  for (const [width, ink] of [[w + LINE * 2, COLORS.outline], [w, color]] as const) {
    g.moveTo(x0, y0).lineTo(bx, by).stroke({ color: ink, width, cap: 'round' });
  }
  g.poly([x1, y1, bx + nx, by + ny, bx - nx, by - ny]).fill(color).stroke({ color: COLORS.outline, width: LINE, join: 'round' });
}

/** A red mark on the ground, where a blow lands. */
function groundMark(g: Graphics, x: number, y: number, rx: number, ry: number): void {
  g.ellipse(x, y, rx, ry).fill({ color: DANGER, alpha: 0.45 }).stroke({ color: DANGER, width: LINE });
}

function crowd(g: Graphics): void {
  // the way round the horde, then the horde, then the hero caught inside it
  g.arc(0, 0, 100, -0.95 * Math.PI, -0.2 * Math.PI).stroke({ color: COLORS.outline, width: 12 + LINE * 2, cap: 'round' });
  g.arc(0, 0, 100, -0.95 * Math.PI, -0.2 * Math.PI).stroke({ color: MOVE, width: 12, cap: 'round' });
  const a = -0.2 * Math.PI;
  arrow(g, 100 * Math.cos(a - 0.1), 100 * Math.sin(a - 0.1), 100 * Math.cos(a + 0.18), 100 * Math.sin(a + 0.18));
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * 2 * Math.PI + 0.3;
    foe(g, Math.cos(t) * 58, Math.sin(t) * 50 + 10, 20);
  }
  hero(g, 0, 10, 24);
}

function touch(g: Graphics): void {
  foe(g, -40, 0, 66, BIG_FOE);
  hero(g, 70, 40, 24);
  arrow(g, 92, 28, 120, -20);
}

function charge(g: Graphics): void {
  // the aim line runs through the hero; the white arrow steps him off it
  arrow(g, -50, 30, 115, 30, DANGER, 14);
  foe(g, -85, 30, 34, BIG_FOE);
  hero(g, 45, -40, 24);
  arrow(g, 45, 18, 45, -8);
}

function slam(g: Graphics): void {
  groundMark(g, -25, 25, 90, 46);
  g.circle(-25, 25, 16).fill(DANGER);
  arrow(g, -10, 22, 75, 10);
  hero(g, 100, 6, 24);
}

function emerge(g: Graphics): void {
  g.ellipse(-30, 40, 85, 34).fill(0x6a5a44).stroke({ color: COLORS.outline, width: LINE });
  // a head rising out of the cracks
  g.arc(-30, 40, 30, Math.PI, 0).closePath().fill(FOE).stroke({ color: COLORS.outline, width: LINE });
  for (const sx of [-1, 1]) g.circle(-30 + sx * 10, 26, 5).fill(EYE);
  g.moveTo(-100, 42).lineTo(-80, 34).lineTo(-66, 46).moveTo(10, 46).lineTo(26, 34).lineTo(44, 44).stroke({ color: COLORS.outline, width: 6, join: 'miter' });
  arrow(g, 30, 10, 80, -20);
  hero(g, 100, -36, 24);
}

function bullet(g: Graphics): void {
  foe(g, -95, 20, 30);
  g.moveTo(-60, 20).lineTo(115, 20).stroke({ color: DANGER, width: 4 });
  for (const x of [-35, 10, 55]) g.circle(x, 20, 13).fill(DANGER).stroke({ color: COLORS.outline, width: 6 });
  arrow(g, 95, 8, 95, -24);
  hero(g, 95, -54, 22);
}

function level(g: Graphics): void {
  const gem = [-20, -75, 45, -10, -20, 70, -85, -10];
  g.poly(gem.map((v, i) => v + (i % 2 ? 12 : 0))).fill({ color: 0x000000, alpha: 0.35 });
  g.poly(gem).fill(GEM);
  g.poly([-20, -10, 45, -10, -20, 70]).fill(shade(GEM, -0.3));
  g.poly(gem).stroke({ color: COLORS.outline, width: LINE, join: 'round' });
  g.poly([-20, -58, 0, -26, -40, -26]).fill(shade(GEM, 0.55));
  arrow(g, 95, 60, 95, -60, COLORS.jade, 16);
}

const DRAW: Record<DeathCause, (g: Graphics) => void> = { crowd, touch, charge, slam, zone: slam, emerge, bullet, level };

/** The picture for a cause. */
export function fallIcon(cause: DeathCause): Graphics {
  const g = new Graphics();
  DRAW[cause](g);
  return g;
}
