import { BlurFilter, ColorMatrixFilter, Container, FillGradient, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { formatAmount, t } from '../i18n';
import { seeTab, TABS, tabLock, tabNew, type Lock, type Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import { monkAffordable } from '../meta/monks';
import { iconSprite, lockIcon, lockedLook, type IconSheet } from './buildBar';
import { anyChestWaiting } from '../meta/progressChests';
import { canTrain } from '../meta/waiting';
import { shopWaiting } from './lobbyEconomy';
import { isWide, TAB_H, tabCells, TOP_H } from './lobbyLayout';
import type { UiFrame } from './uiLayout';
import { COLORS, button, dot, fit, label, shade } from './widgets';

// The lobby's frame around its tabs: the painted courtyard behind everything, the top bar (the
// monk's portrait, name and level, the currencies, settings) and the bottom tab bar.

export { TAB_H, TOP_H };
/** How far the bars reach past the frame, over the safe-area bands (more than any inset). */
const BLEED = 800;

/** The picture on each tab (ids in the icon sheet). */
const TAB_ICONS: Record<Tab, string> = { shop: 'shop', gear: 'robe', play: 'ball', train: 'tab_train', codex: 'codex' };

/** How far the backdrop steps back: saturation and contrast change, brightness factor. */
const STAGE_TONE = { saturate: -0.4, contrast: -0.18, brightness: 1.04 };
/**
 * Behind the menu tabs (Shop, Train, Codex) the courtyard goes out of focus and grey, then under
 * a veil of the shell's own background and a darker rim, so it reads as the theme's surface with
 * a hint of the place rather than a muddy photograph, and the dark panels sit on it like the bars.
 */
const MENU_TONE = { saturate: -0.85, contrast: -0.25, brightness: 0.9, blur: 16 };
/** How much of the background colour lies over the blurred courtyard, and how dark the rim gets. */
const MENU_VEIL = 0.45;
const MENU_RIM = 0.5;

function toned(k: typeof STAGE_TONE): ColorMatrixFilter {
  const tone = new ColorMatrixFilter();
  tone.saturate(k.saturate, true);
  tone.contrast(k.contrast, true);
  tone.brightness(k.brightness, true);
  return tone;
}

/** The last baked menu courtyards, portrait and landscape, and the painting each came from: they outlive the painting, which a run frees. */
const baked: [{ from: Texture; out: Texture } | null, { from: Texture; out: Texture } | null] = [null, null];

/**
 * The courtyard for the menu tabs, baked once: a blur every frame would cost a low-end phone its
 * frame rate. Kept (at half resolution, which a blur loses nothing to) after the painting is
 * freed for a run, so the screens around the run sit on it too; `tex` null gives that last bake.
 * `wide` bakes it for a landscape frame: the painting with its mirror image on either side, so the
 * blur runs on across the width and the dark rim lands on the frame's edges, not the painting's.
 */
export function menuBackdrop(renderer: Renderer, tex: Texture, wide?: boolean): Texture;
export function menuBackdrop(renderer: Renderer, tex: Texture | null, wide?: boolean): Texture | null;
export function menuBackdrop(renderer: Renderer, tex: Texture | null, wide = false): Texture | null {
  const slot = wide ? 1 : 0;
  const last = baked[slot];
  if (!tex || tex === last?.from) return last?.out ?? null;
  const panels = wide ? [-1, 0, 1] : [0];
  const w = tex.width * panels.length;
  const scene = new Container();
  const pics = new Container();
  for (const side of panels) {
    const pic = new Sprite(tex);
    pic.anchor.set(0.5, 0);
    pic.scale.x = side ? -1 : 1;
    pic.x = w / 2 + side * tex.width;
    pics.addChild(pic);
  }
  const blur = new BlurFilter({ strength: MENU_TONE.blur, quality: 3 });
  blur.repeatEdgePixels = true;
  pics.filters = [blur, toned(MENU_TONE)];
  const rim = new FillGradient({
    type: 'radial', center: { x: 0.5, y: 0.45 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.45 }, outerRadius: 0.75,
    colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 0.55, color: 'rgba(0,0,0,0)' }, { offset: 1, color: `rgba(0,0,0,${MENU_RIM})` }],
    textureSpace: 'local',
  });
  scene.addChild(pics, new Graphics().rect(0, 0, w, tex.height).fill({ color: COLORS.bg, alpha: MENU_VEIL })
    .rect(0, 0, w, tex.height).fill(rim));
  const out = renderer.generateTexture({ target: scene, frame: new Rectangle(0, 0, w, tex.height), resolution: 0.5 });
  scene.destroy({ children: true });
  rim.destroy();
  last?.out.destroy(true);
  baked[slot] = { from: tex, out };
  return out;
}

/**
 * The baked menu courtyard (menuBackdrop) over the whole frame and the bands past it, for the
 * screens between runs (results, resume); the flat background where there is no painting. It
 * takes taps, so nothing under it does.
 */
export function menuCover(f: UiFrame, tex: Texture | null): Container {
  const c = new Container();
  c.addChild(new Graphics().rect(-BLEED, -BLEED, f.w + 2 * BLEED, f.h + 2 * BLEED).fill(COLORS.bg));
  if (tex) {
    const pic = new Sprite(tex);
    pic.anchor.set(0.5);
    pic.scale.set(Math.max(f.w / tex.width, f.h / tex.height));
    pic.position.set(f.w / 2, f.h / 2);
    c.addChild(pic);
  }
  c.eventMode = 'static';
  return c;
}

/** How wide the daylight courtyard stands in a landscape lobby, and the veil over its mirrored wings. */
const STAGE_W = 1500;
const WING_VEIL = 0.55;
/** How far into the stage the veil thins out, so its edges are not a seam of their own. */
const WING_FADE = 240;

/** The veil's fade at the stage's left (-1) and right (1) edge; made once and kept. */
const fades = new Map<number, FillGradient>();
function wingFade(dir: number): FillGradient {
  let g = fades.get(dir);
  if (!g) {
    const veil = (offset: number) => ({ offset, color: COLORS.bg });
    const clear = (offset: number) => ({ offset, color: 'rgba(0,0,0,0)' });
    g = new FillGradient({
      type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
      colorStops: dir < 0 ? [veil(0), clear(1)] : [clear(0), veil(1)],
      textureSpace: 'local',
    });
    fades.set(dir, g);
  }
  return g;
}

/**
 * The painted courtyard in daylight, covering the frame between the bars; `baked` for the menu
 * tabs' picture (menuBackdrop), which is toned already. The painting is portrait: a landscape
 * frame shows it as a stage in the middle, with the painting mirrored past both its edges, under a
 * veil of the background, so the courtyard runs on without a seam but the stage stays the subject.
 */
export function scenery(f: UiFrame, tex: Texture | null, baked = false): Container {
  const c = new Container();
  if (!tex) return c;
  const room = f.h - TOP_H - TAB_H;
  const stage = isWide(f.w, f.h) && !baked;
  const w = stage ? STAGE_W : f.w;
  const scale = Math.max(w / tex.width, room / tex.height);
  const inner = new Container();
  // a stage set, not a second subject: the painting a step greyer and flatter than the figures on it
  const tone = baked ? [] : [toned(STAGE_TONE)];
  for (const side of stage ? [-1, 0, 1] : [0]) {
    const pic = new Sprite(tex);
    pic.anchor.set(0.5, 1);
    pic.scale.set(side ? -scale : scale, scale);
    // the courtyard's floor meets the tab bar; a taller picture loses sky first
    pic.position.set(f.w / 2 + side * tex.width * scale, f.h - TAB_H);
    pic.filters = tone;
    inner.addChild(pic);
  }
  if (stage) {
    const half = tex.width * scale / 2;
    inner.addChild(new Graphics().rect(0, TOP_H, f.w / 2 - half, room).rect(f.w / 2 + half, TOP_H, f.w / 2 - half, room)
      .fill({ color: COLORS.bg, alpha: WING_VEIL }));
    for (const dir of [-1, 1]) {
      const x = dir < 0 ? f.w / 2 - half : f.w / 2 + half - WING_FADE;
      inner.addChild(new Graphics().rect(x, TOP_H, WING_FADE, room).fill({ fill: wingFade(dir), alpha: WING_VEIL }));
    }
  }
  const mask = new Graphics().rect(0, TOP_H, f.w, room).fill(0xffffff);
  inner.mask = mask;
  c.addChild(inner, mask);
  return c;
}

/** A bar's lacquer from y, h tall: the panel colour, with the outline and a gold trim line inside it at `edge`. */
function bar(w: number, y: number, h: number, edge: number, trimBelow: boolean): Graphics {
  return new Graphics().rect(0, y, w, h).fill(COLORS.panel)
    .rect(0, edge - 3, w, 6).fill(COLORS.outline)
    .rect(0, trimBelow ? edge + 3 : edge - 9, w, 6).fill(COLORS.trim);
}

export interface TopBarActions {
  monks(): void;
  settings(): void;
  /** Rolls a new dice name; null when a portal account names the player. */
  reroll: (() => void) | null;
}

export function topBar(w: number, save: SaveData, shown: string, icons: IconSheet, a: TopBarActions): Container {
  const c = new Container();
  // the bar runs on into the safe-area band above the frame
  c.addChild(bar(w, -BLEED, TOP_H + BLEED, TOP_H - 3, false));
  // the avatar is the monk played as; it opens the monk panel
  const avatar = new Container();
  avatar.position.set(90, TOP_H / 2);
  avatar.addChild(new Graphics().circle(0, 0, 58).fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 6 }));
  // the portrait's head and shoulders, cut to the circle
  const face = iconSprite(icons, `monk_${save.monk}`, 230);
  if (face) {
    face.y = 62;
    const mask = new Graphics().circle(0, 0, 53).fill(0xffffff);
    face.mask = mask;
    avatar.addChild(face, mask);
  }
  if (monkAffordable(save)) avatar.addChild(dot(44, -44));
  avatar.eventMode = 'static';
  avatar.cursor = 'pointer';
  avatar.on('pointertap', a.monks);
  // the name and level roll a new name, the die next to it says so
  const who = new Container();
  const name = fit(label(shown, 48, COLORS.text, { align: 'left' }), 290, 60);
  name.anchor.set(0, 0.5);
  name.position.set(160, TOP_H / 2 - 26);
  const level = label(t('lobby.level', { level: save.level }), 48, COLORS.dim);
  level.anchor.set(0, 0.5);
  level.position.set(160, TOP_H / 2 + 28);
  who.addChild(name, level);
  if (a.reroll) {
    // the painted die (the sheet's `dice`), tilted the other way on every roll
    const d = iconSprite(icons, 'dice', 72);
    if (d) {
      d.position.set(name.x + name.width + 42, name.y);
      d.rotation = save.dice % 2 ? 0.18 : -0.18;
      who.addChild(d);
    }
    who.hitArea = { contains: (x: number, y: number) => x >= 150 && x <= 520 && y >= 0 && y <= TOP_H };
    who.eventMode = 'static';
    who.cursor = 'pointer';
    who.on('pointertap', a.reroll);
  }
  c.addChild(avatar, who);

  const icon = iconSprite(icons, 'settings', 88);
  const gear = button(icon ? '' : '⚙', 100, 100, a.settings, { fill: COLORS.panelLocked, size: 56, icon });
  gear.position.set(w - 80, TOP_H / 2 - 4);
  gear.label = 'settings'; // an icon alone: tests find it by name
  c.addChild(gear);
  // the currencies right-aligned, left of the settings button: a dark pill with the coin over its left end
  let x = w - 160;
  for (const [amount, id, color] of [[save.jade, 'jade', COLORS.jade], [save.copper, 'copper', COLORS.copper]] as const) {
    const text = label(formatAmount(amount), 48);
    text.anchor.set(1, 0.5);
    text.position.set(x - 18, TOP_H / 2);
    const left = x - text.width - 70;
    const pill = new Graphics().roundRect(left, TOP_H / 2 - 30, x - left, 60, 30).fill(shade(COLORS.outline, 0.08)).stroke({ color: shade(COLORS.panel, 0.2), width: 3 });
    const coin = iconSprite(icons, id, 76) ?? new Graphics().circle(0, 0, 24).fill(color).stroke({ color: COLORS.outline, width: 5 });
    coin.position.set(left + 8, TOP_H / 2);
    c.addChild(pill, coin, text);
    x = left - 40;
  }
  return c;
}

export interface TabBarActions {
  select(tab: Tab, save: SaveData): void;
  locked(lock: Lock): void;
}

/**
 * The five tabs along the bottom, always all of them (a locked one greyed with a padlock, saying on
 * a tap when it opens): picture over name, the open one raised in saffron. While a new player's
 * arrow points somewhere (`hint`), only that tab keeps its dot, so there is one next step.
 */
export function tabBar(w: number, h: number, save: SaveData, current: Tab, icons: IconSheet, a: TabBarActions, hint: Tab | null = null): Container {
  const c = new Container();
  const { x0, tw } = tabCells(w, h, TABS.length);
  c.addChild(bar(w, h - TAB_H, TAB_H + BLEED, h - TAB_H + 3, true));
  TABS.forEach((tab, i) => {
    const lock = tabLock(save, tab);
    const active = tab === current;
    const cell = new Container();
    cell.position.set(x0 + tw * i, h - TAB_H / 2 + 4);
    if (active) {
      cell.addChild(new Graphics()
        .roundRect(-tw / 2 + 8, -TAB_H / 2 + 6, tw - 16, TAB_H - 20, 26).fill(shade(COLORS.saffron, -0.35)).stroke({ color: COLORS.outline, width: 6 })
        .roundRect(-tw / 2 + 12, -TAB_H / 2 + 10, tw - 24, TAB_H - 40, 22).fill(COLORS.saffron));
    }
    const pic = iconSprite(icons, TAB_ICONS[tab], active ? 100 : 86);
    if (pic) {
      pic.y = active ? -30 : -22;
      if (lock) lockedLook(pic, true);
      cell.addChild(pic);
    }
    const name = fit(label(t(`tab.${tab}` as never), 48, active ? COLORS.outline : lock ? COLORS.dim : COLORS.text, {
      stroke: active ? undefined : { color: COLORS.outline, width: 6 },
    }), tw - 24);
    name.y = active ? 46 : 54;
    cell.addChild(name);
    if (lock) {
      const l = lockIcon(icons, 52);
      l.position.set(tw / 2 - 40, -TAB_H / 2 + 44);
      cell.addChild(l);
    } else if (!active && (!hint || hint === tab) && (tabNew(save, tab) || (tab === 'shop' && shopWaiting(save, Date.now())) || (tab === 'play' && anyChestWaiting(save)) || (tab === 'train' && canTrain(save)))) {
      // the open tab shows what is waiting itself
      cell.addChild(dot(tw / 2 - 30, -TAB_H / 2 + 30));
    }
    cell.eventMode = 'static';
    cell.cursor = 'pointer';
    cell.on('pointertap', () => {
      if (lock) return a.locked(lock);
      a.select(tab, tabNew(save, tab) ? seeTab(save, tab) : save);
    });
    c.addChild(cell);
  });
  return c;
}

/** A saffron arrow over `tab`'s cell, pointing down at it; the lobby bobs it by its pivot. */
export function hintArrow(w: number, h: number, tab: Tab): Container {
  const c = new Container();
  const { x0, tw } = tabCells(w, h, TABS.length);
  c.position.set(x0 + tw * TABS.indexOf(tab), h - TAB_H + 15);
  c.addChild(new Graphics()
    .poly([-24, -95, 24, -95, 24, -50, 52, -50, 0, 5, -52, -50, -24, -50]).fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 7 }));
  c.eventMode = 'none';
  return c;
}
