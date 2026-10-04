import type { Container } from 'pixi.js';
import type { Viewport } from '../game/viewport';
import { DESIGN_H, DESIGN_W } from '../game/viewport';

// Maps the play area onto UI logical units. Phones get the full 1080 width and extra
// height; wider desktop play areas keep the whole 1920 height and gain width instead.
// Pure, so it is tested without Pixi.

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
  const scale = Math.min(vp.playW / DESIGN_W, vp.playH / DESIGN_H);
  // the play area is centred, so each letterbox bar is playY tall
  const top = Math.max(0, insets.top - vp.playY);
  const bottom = Math.max(0, insets.bottom - vp.playY);
  return { scale, x: vp.playX, y: vp.playY + top, w: vp.playW / scale, h: (vp.playH - top - bottom) / scale };
}

/** A full-screen UI layer; layout() rebuilds it for the current frame. */
export interface Screen {
  readonly view: Container;
  layout(f: UiFrame): void;
  /** Animates, every frame, if the screen has anything moving. */
  update?(dt: number): void;
  destroy(): void;
}
