import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { getLocale, type Locale } from '../i18n';

// Small UI building blocks in logical units (the 1080-wide design), in the sticker style of the
// figures: flat colours, a thick dark outline and one hard shadow. Panels sit on a dark drop
// shadow with a thin light rim inside and gold corner brackets; buttons are raised, a darker lip
// under a lighter face that sinks onto the lip while pressed.

/** System fonts with CJK fallbacks (docs/design.md "Localization": system fonts on web). */
export const FONT = 'Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
/** Japanese and Korean put their own fonts first, so shared Han characters take their forms. */
const LOCAL_FONT: Partial<Record<Locale, string>> = {
  ja: 'Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", Meiryo, "Noto Sans CJK JP", sans-serif',
  ko: 'Arial, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif',
};

export const COLORS = {
  bg: 0x1d2420,
  panel: 0x2c3631,
  panelLocked: 0x232a26,
  outline: 0x0b0e0c,
  text: 0xffffff,
  dim: 0x8f9a94,
  saffron: 0xf0a020,
  copper: 0xd88a4a,
  jade: 0x4fd1a0,
  danger: 0xe0303a,
  /** The panels' corner brackets and the bars' trim. */
  trim: 0xc9a35a,
};

/** `color` moved towards black (k < 0) or white (k > 0) by |k|. */
export function shade(color: number, k: number): number {
  const to = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  const ch = (shift: number) => {
    const c = (color >> shift) & 0xff;
    return Math.round(c + (to - c) * a) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

/** How far a panel's and a button's hard shadow drops. */
const DROP = 12;
/** A button's lip under its face. */
const LIP = 14;

export function label(text: string, size = 48, fill = COLORS.text, extra: TextStyleOptions = {}): Text {
  const t = new Text({
    text,
    style: { fontFamily: LOCAL_FONT[getLocale()] ?? FONT, fontSize: size, fill, fontWeight: 'bold', align: 'center', ...extra },
  });
  t.anchor.set(0.5);
  return t;
}

export function panel(w: number, h: number, fill = COLORS.panel, radius = 28): Graphics {
  const g = new Graphics()
    .roundRect(-w / 2, -h / 2 + DROP, w, h, radius).fill({ color: 0x000000, alpha: 0.4 })
    .roundRect(-w / 2, -h / 2, w, h, radius).fill(fill).stroke({ color: COLORS.outline, width: 8 });
  // a thin lighter rim inside the outline, and gold brackets in the corners of the big ones
  const inset = 14;
  g.roundRect(-w / 2 + inset, -h / 2 + inset, w - 2 * inset, h - 2 * inset, Math.max(4, radius - inset / 2))
    .stroke({ color: shade(fill, 0.14), width: 3 });
  if (w >= 300 && h >= 200) corners(g, w, h, inset + 10);
  return g;
}

/** Gold L-shaped brackets in the four corners of a w x h box, `inset` in. */
function corners(g: Graphics, w: number, h: number, inset: number): void {
  const n = 34;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * (w / 2 - inset);
      const y = sy * (h / 2 - inset);
      g.moveTo(x, y - sy * n).lineTo(x, y).lineTo(x - sx * n, y);
    }
  }
  g.stroke({ color: COLORS.trim, width: 6, cap: 'round', join: 'round' });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.circle(sx * (w / 2 - inset - 14), sy * (h / 2 - inset - 14), 4);
  g.fill(COLORS.trim);
}

/** A raised button face: the lip, the face over it, a highlight; the outline round both. */
function buttonFace(w: number, h: number, fill: number): { base: Graphics; face: Graphics } {
  const r = Math.min(28, h / 3);
  const base = new Graphics()
    .roundRect(-w / 2, -h / 2 + DROP, w, h, r).fill({ color: 0x000000, alpha: 0.35 })
    .roundRect(-w / 2, -h / 2, w, h, r).fill(shade(fill, -0.35)).stroke({ color: COLORS.outline, width: 8 });
  const face = new Graphics().roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8 - LIP, Math.max(4, r - 4)).fill(fill);
  if (h >= 80) face.roundRect(-w / 2 + 22, -h / 2 + 14, w - 44, Math.min(14, h * 0.1), 7).fill(shade(fill, 0.3));
  return { base, face };
}

export interface ButtonOptions {
  fill?: number;
  size?: number;
  textFill?: number;
  /** Marks a button that plays a rewarded ad with a video badge (a portal requirement). */
  video?: boolean;
  /** A picture left of the label (an icon sprite), or alone when the label is empty. */
  icon?: Container | null;
}

let tapSound = () => {};

/** What every button does on a tap besides its own action (the shell plays a click). */
export function onButtonTap(fn: () => void): void {
  tapSound = fn;
}

/** The button click, for tappable things that are not buttons. */
export function playTap(): void {
  tapSound();
}

/**
 * A tappable raised button with a centred label. It sinks onto its lip while pressed and fires
 * on release over it, so a drag that starts on a button and leaves it does nothing.
 */
export function button(text: string, w: number, h: number, onTap: () => void, o: ButtonOptions = {}): Container {
  const c = new Container();
  const t = label(text, o.size ?? 56, o.textFill ?? COLORS.text);
  // long translations shrink to fit instead of overflowing (design: leave ~30 % room)
  const badge = o.video ? videoBadge(h * 0.42, o.textFill ?? COLORS.text) : o.icon ?? null;
  const gap = badge && text ? badge.width + 20 : 0;
  const room = w - 48 - gap;
  if (t.width > room) t.scale.set(room / t.width);
  const { base, face } = buttonFace(w, h, o.fill ?? COLORS.saffron);
  // the face, the badge and the label ride together LIP above the button's middle
  const top = new Container();
  top.addChild(face, t);
  face.y = LIP / 2;
  if (badge && o.video) {
    t.x = gap / 2;
    badge.x = t.x - t.width / 2 - gap + badge.width / 2;
    top.addChild(badge);
  } else if (badge) {
    // an icon keeps to the left end, so a label changed later stays clear of it
    badge.x = text ? -w / 2 + 24 + badge.width / 2 : 0;
    t.x = gap / 2;
    top.addChild(badge);
  }
  c.addChild(base, top);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  let down = false;
  const press = (on: boolean) => {
    top.y = -LIP / 2 + (on ? LIP * 0.6 : 0);
  };
  press(false);
  c.on('pointerdown', () => {
    down = true;
    press(true);
  });
  const reset = () => {
    down = false;
    press(false);
  };
  c.on('pointerupoutside', reset);
  c.on('pointerleave', reset);
  c.on('pointerup', () => {
    const fire = down;
    reset();
    if (fire) {
      tapSound();
      onTap();
    }
  });
  return c;
}

/** A video camera's play sign: a rounded frame with a triangle, `h` tall, centred. */
function videoBadge(h: number, color: number): Graphics {
  const w = h * 1.4;
  const g = new Graphics().roundRect(-w / 2, -h / 2, w, h, h * 0.22).stroke({ width: h * 0.13, color });
  const r = h * 0.26;
  return g.poly([-r * 0.7, -r, r, 0, -r * 0.7, r]).fill(color);
}

/** A button's label, for callers that change it later. */
export function buttonLabel(b: Container): Text {
  const top = b.children[1] as Container;
  return top.children[1] as Text;
}

/** Scales a text down so it fits `maxW`, keeping it centred. */
export function fit(t: Text, maxW: number): Text {
  t.scale.set(1);
  if (t.width > maxW) t.scale.set(maxW / t.width);
  return t;
}

/** A dark full-screen layer that swallows taps, for modal panels. */
export function backdrop(w: number, h: number, alpha = 0.6): Graphics {
  // reaches past the frame's top and bottom, over the safe-area bands the UI keeps clear of
  const g = new Graphics().rect(0, -h, w, 3 * h).fill({ color: 0x000000, alpha });
  g.eventMode = 'static';
  return g;
}

/** A red dot that marks something to collect, at (x, y). */
export function dot(x: number, y: number): Graphics {
  return new Graphics().circle(x, y, 18).fill(COLORS.danger).stroke({ color: COLORS.outline, width: 5 });
}

/** A horizontal bar centred on x = 0, filled to `share`; returns its fill to update. */
export function meter(w: number, share: number, color: number): { view: Container; set(share: number): void } {
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
