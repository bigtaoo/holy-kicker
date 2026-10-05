import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';

// Small UI building blocks in logical units (the 1080-wide design). Placeholder look: flat
// rounded panels with a thick dark outline, matching the sticker style until real UI art.

/** System fonts with CJK fallbacks (docs/design.md "Localization": system fonts on web). */
export const FONT = 'Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

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
};

export function label(text: string, size = 48, fill = COLORS.text, extra: TextStyleOptions = {}): Text {
  const t = new Text({
    text,
    style: { fontFamily: FONT, fontSize: size, fill, fontWeight: 'bold', align: 'center', ...extra },
  });
  t.anchor.set(0.5);
  return t;
}

export function panel(w: number, h: number, fill = COLORS.panel, radius = 28): Graphics {
  return new Graphics().roundRect(-w / 2, -h / 2, w, h, radius).fill(fill).stroke({ color: COLORS.outline, width: 8 });
}

export interface ButtonOptions {
  fill?: number;
  size?: number;
  textFill?: number;
  /** Marks a button that plays a rewarded ad with a video badge (a portal requirement). */
  video?: boolean;
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
 * A tappable panel with a centred label. It sinks a little while pressed and fires on
 * release over it, so a drag that starts on a button and leaves it does nothing.
 */
export function button(text: string, w: number, h: number, onTap: () => void, o: ButtonOptions = {}): Container {
  const c = new Container();
  const t = label(text, o.size ?? 56, o.textFill ?? COLORS.text);
  // long translations shrink to fit instead of overflowing (design: leave ~30 % room)
  const badge = o.video ? videoBadge(h * 0.42, o.textFill ?? COLORS.text) : null;
  const gap = badge ? badge.width + 20 : 0;
  const room = w - 48 - gap;
  if (t.width > room) t.scale.set(room / t.width);
  c.addChild(panel(w, h, o.fill ?? COLORS.saffron), t);
  if (badge) {
    t.x = gap / 2;
    badge.x = t.x - t.width / 2 - gap + badge.width / 2;
    c.addChild(badge);
  }
  c.eventMode = 'static';
  c.cursor = 'pointer';
  let down = false;
  c.on('pointerdown', () => {
    down = true;
    c.scale.set(0.96);
  });
  const reset = () => {
    down = false;
    c.scale.set(1);
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
