import type { Container } from 'pixi.js';
import type { Viewport } from '../game/viewport';
import { DESIGN_H, DESIGN_W } from '../game/viewport';

// Maps the play area onto UI logical units. Phones get the full 1080 width and extra
// height; wider desktop play areas keep the whole 1920 height and gain width instead.
// Pure, so it is tested without Pixi.

/** The squarest a landscape frame's UI gets (its rows need the width), while its play area stops at 16:10. */
const UI_WIDE_MIN = 4 / 3;

export interface UiFrame {
  /** Screen pixels per UI unit. */
  scale: number;
  /** Screen position of the UI's top-left corner. */
  x: number;
  y: number;
  /** UI size in logical units: at least 1080 x 1920 on any shape the viewport allows. */
  w: number;
  h: number;
}

/**
 * `insets` are the screen bands to keep clear (status bar, notch, WeChat's capsule, home
 * indicator); a letterbox bar already counts towards them. The world still draws under them.
 */
export function uiFrame(vp: Viewport, insets: { top: number; bottom: number } = { top: 0, bottom: 0 }): UiFrame {
  // a landscape play area (never narrower than 16:10) on a squarer screen, a 4:3 tablet on its side, has bars above and
  // below: the UI spreads over them, down to a 4:3 shape, so its text stays the size the 3:4 frame gave it
  const playY = vp.playW > vp.playH ? Math.max(0, vp.playY - Math.max(0, vp.playW / UI_WIDE_MIN - vp.playH) / 2) : vp.playY;
  const playH = vp.playH + 2 * (vp.playY - playY);
  const scale = Math.min(vp.playW / DESIGN_W, playH / DESIGN_H);
  // the UI area is centred, so each bar left over is playY tall
  const top = Math.max(0, insets.top - playY);
  const bottom = Math.max(0, insets.bottom - playY);
  return { scale, x: vp.playX, y: playY + top, w: vp.playW / scale, h: (playH - top - bottom) / scale };
}

/** A full-screen UI layer; layout() rebuilds it for the current frame. */
export interface Screen {
  readonly view: Container;
  layout(f: UiFrame): void;
  /** Animates, every frame, if the screen has anything moving. */
  update?(dt: number): void;
  /** A key went down (the web's keyboard), `code` as KeyboardEvent.code names it. */
  key?(code: string, repeat: boolean): void;
  destroy(): void;
}
