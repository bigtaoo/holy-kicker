import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { MonkId } from '@hk/engine';
import type { IconSheet } from './buildBar';
import type { DeathCause } from './deathInfo';
import { gemColor } from '../game/dropView';
import { COLORS, shade } from './widgets';

// The death panel's picture of what went wrong and what to do instead, staged with the game's
// own figures: the monk who fell and the jiangshi (the elite a bigger, steel-blue one, as in the
// run), danger in red and the way out a white arrow. Without the textures (a test) the figures
// are drawn as sticker discs. About 240 x 170 units, centred.

const LINE = 7;
const HERO = COLORS.saffron;
const FOE = 0x4f8f96;
const BIG_FOE = 0x6c4f9a;
const EYE = 0xff3030;
const DANGER = COLORS.danger;
const MOVE = COLORS.text;
/** The run's experience gem, in the colour it is drawn in (game/dropView.ts). */
const GEM = gemColor();
/** The charging elite's tint (game/cast.ts ELITE_TINTS). */
const ELITE_TINT = 0x9fb2d8;

/** The figures a picture is staged with; a missing one is drawn. */
export interface FallFigures {
  /** The monk's portrait, standing (art/icons/monks). */
  hero?: Texture;
  /** A jiangshi standing, facing left (the mob sheet's first frame). */
  foe?: Texture;
}

/** The figures in `icons`: the portrait of `monk` and the jiangshi (art.ts puts its frame in as `fig_jiangshi`). */
export function fallFigures(icons: IconSheet, monk: MonkId = 'kicker'): FallFigures {
  return { hero: icons.get(`monk_${monk}`) ?? icons.get('monk_kicker'), foe: icons.get('fig_jiangshi') };
}

/** A picture under construction: the ground marks and arrows, and the figures over them sorted by their feet. */
interface Stage {
  g: Graphics;
  figs: [number, Container][];
  f: FallFigures;
}

/** A round figure with its hard cel shadow on the lower right. */
function disc(x: number, y: number, r: number, fill: number, eyes: boolean): Graphics {
  const g = new Graphics();
  g.circle(x, y, r).fill(fill);
  g.moveTo(x, y).arc(x, y, r, -0.15 * Math.PI, 0.85 * Math.PI).closePath().fill(shade(fill, -0.3));
  g.circle(x, y, r).stroke({ color: COLORS.outline, width: LINE });
  if (eyes) for (const sx of [-1, 1]) g.circle(x + sx * r * 0.32, y - r * 0.15, Math.max(3, r * 0.14)).fill(EYE);
  return g;
}

/** A figure `h` tall standing at (x, y), with a dark ground shadow `w` wide. */
function figure(st: Stage, tex: Texture | undefined, x: number, y: number, h: number, w: number, flip = false, tint = 0xffffff, fallback = 0): void {
  const c = new Container();
  if (tex) {
    c.addChild(new Graphics().ellipse(x, y, w / 2, w / 7).fill({ color: COLORS.outline, alpha: 0.4 }));
    const s = new Sprite(tex);
    s.anchor.set(0.5, 0.97);
    s.scale.set(h / tex.height);
    if (flip) s.scale.x *= -1;
    s.position.set(x, y);
    s.tint = tint;
    c.addChild(s);
  } else {
    c.addChild(disc(x, y - w / 2.4, w / 2.4, fallback, fallback !== HERO));
  }
  st.figs.push([y, c]);
}

/** The hero standing at (x, y), `h` tall. */
function hero(st: Stage, x: number, y: number, h = 96): void {
  figure(st, st.f.hero, x, y, h * 1.25, h * 0.55, false, 0xffffff, HERO);
}

/** A jiangshi standing at (x, y), `h` tall; `faceRight` turns it, `big` makes it the elite. */
function foe(st: Stage, x: number, y: number, h: number, faceRight = false, big = false): void {
  figure(st, st.f.foe, x, y, h * 1.3, h * 0.6, faceRight, big ? ELITE_TINT : 0xffffff, big ? BIG_FOE : FOE);
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
  g.ellipse(x, y, rx, ry).fill({ color: DANGER, alpha: 0.4 }).stroke({ color: DANGER, width: LINE });
}

function crowd(st: Stage): void {
  // the horde closed round the hero, and the white way out over their heads before they shut it
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 2 * Math.PI + 0.25;
    foe(st, Math.cos(a) * 78, 45 + Math.sin(a) * 28, 52, Math.cos(a) < 0);
  }
  hero(st, 0, 58, 84);
  st.figs.push([999, arrowLayer((g) => {
    g.arc(0, 25, 105, -0.95 * Math.PI, -0.22 * Math.PI).stroke({ color: COLORS.outline, width: 12 + LINE * 2, cap: 'round' });
    g.arc(0, 25, 105, -0.95 * Math.PI, -0.22 * Math.PI).stroke({ color: MOVE, width: 12, cap: 'round' });
    const a = -0.22 * Math.PI;
    arrow(g, 105 * Math.cos(a - 0.1), 25 + 105 * Math.sin(a - 0.1), 105 * Math.cos(a + 0.22), 25 + 105 * Math.sin(a + 0.22));
  })]);
}

function arrowLayer(draw: (g: Graphics) => void): Graphics {
  const g = new Graphics();
  draw(g);
  return g;
}

function touch(st: Stage): void {
  // the elite is too big to stand against: step back out of its reach
  foe(st, -45, 72, 125, true, true);
  hero(st, 65, 72, 84);
  arrow(st.g, 85, 0, 120, -45);
}

function charge(st: Stage): void {
  // the charge runs down its red lane; the white arrow steps the hero off it
  groundMark(st.g, 0, 58, 105, 18);
  arrow(st.g, -40, 58, 108, 58, DANGER, 14);
  foe(st, -85, 66, 100, true, true);
  hero(st, 65, 8, 68);
  st.figs.push([999, arrowLayer((g) => arrow(g, 98, 50, 98, 14))]);
}

function slam(st: Stage): void {
  groundMark(st.g, -40, 45, 80, 36);
  st.g.circle(-40, 45, 14).fill(DANGER);
  arrow(st.g, -25, 38, 45, 30);
  hero(st, 85, 62, 88);
}

function emerge(st: Stage): void {
  // a head rising out of the cracks under where the hero stood
  st.g.ellipse(-30, 58, 80, 28).fill(0x6a5a44).stroke({ color: COLORS.outline, width: LINE });
  if (st.f.foe) {
    const rise = new Container();
    const s = new Sprite(st.f.foe);
    s.anchor.set(0.5, 0.97);
    s.scale.set(140 / st.f.foe.height);
    s.position.set(-30, 105);
    const hole = new Graphics().rect(-130, -100, 200, 158).fill(0xffffff);
    s.mask = hole;
    rise.addChild(hole, s);
    st.figs.push([58, rise]);
  } else {
    st.g.moveTo(-60, 58).arc(-30, 58, 30, Math.PI, 0).closePath().fill(FOE).stroke({ color: COLORS.outline, width: LINE });
    for (const sx of [-1, 1]) st.g.circle(-30 + sx * 10, 44, 5).fill(EYE);
  }
  st.g.moveTo(-95, 60).lineTo(-80, 52).lineTo(-66, 64).moveTo(8, 64).lineTo(24, 52).lineTo(40, 62).stroke({ color: COLORS.outline, width: 6, join: 'miter' });
  arrow(st.g, 30, 30, 70, 0);
  hero(st, 95, 40, 80);
}

function bullet(st: Stage): void {
  foe(st, -95, 70, 76, true);
  st.g.moveTo(-60, 38).lineTo(120, 38).stroke({ color: DANGER, width: 4 });
  for (const x of [-30, 15, 60]) st.g.circle(x, 38, 13).fill(DANGER).stroke({ color: COLORS.outline, width: 6 });
  hero(st, 95, 2, 66);
  st.figs.push([999, arrowLayer((g) => arrow(g, 60, 50, 60, 8))]);
}

function level(st: Stage): void {
  const gem = [-20, -75, 45, -10, -20, 70, -85, -10];
  const g = st.g;
  g.poly(gem.map((v, i) => v + (i % 2 ? 12 : 0))).fill({ color: 0x000000, alpha: 0.35 });
  g.poly(gem).fill(GEM);
  g.poly([-20, -10, 45, -10, -20, 70]).fill(shade(GEM, -0.3));
  g.poly(gem).stroke({ color: COLORS.outline, width: LINE, join: 'round' });
  g.poly([-20, -58, 0, -26, -40, -26]).fill(shade(GEM, 0.55));
  arrow(g, 95, 60, 95, -60, COLORS.jade, 16);
}

const DRAW: Record<DeathCause, (st: Stage) => void> = { crowd, touch, charge, slam, zone: slam, emerge, bullet, level };

/** The picture for a cause, staged with `figs` (fallFigures). */
export function fallIcon(cause: DeathCause, figs: FallFigures = {}): Container {
  const st: Stage = { g: new Graphics(), figs: [], f: figs };
  DRAW[cause](st);
  const c = new Container();
  c.addChild(st.g);
  for (const [, fig] of st.figs.sort((a, b) => a[0] - b[0])) c.addChild(fig);
  return c;
}
