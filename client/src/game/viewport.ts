// Portrait viewport: maps the screen onto a 1080x1920 logical design.
//
// - Phones (aspect <= 9:16) show the full 1080 logical width; taller phones see more height.
// - Wider screens (desktop web) may widen the play area up to 3:4, and the camera zooms in
//   up to ZOOM_AT_WIDEST so characters stay readable in a small 16:9 portal iframe.
// - Beyond 3:4 the play area is pillarboxed; beyond MIN_ASPECT it is letterboxed.
// - `wide`, a landscape run (the engine's RunConfig.wide, chosen by wideScreen on hosts that
//   play sideways): the play area is WIDE_MIN_ASPECT to WIDE_MAX_ASPECT and shows WIDE_VIEW_H
//   of world height, about 2130x1200 at 16:9; a narrower screen letterboxes it.

export const DESIGN_W = 1080;
export const DESIGN_H = 1920;
export const PHONE_ASPECT = DESIGN_W / DESIGN_H; // 9:16
export const MAX_ASPECT = 3 / 4;
export const MIN_ASPECT = 9 / 22;
export const ZOOM_AT_WIDEST = 1.3;
/** A landscape run's play area shape, and the world height it shows (the engine's VIEW_WIDE less a margin). */
export const WIDE_MIN_ASPECT = 16 / 10;
export const WIDE_MAX_ASPECT = 16 / 9;
export const WIDE_VIEW_H = 1200;
/** The screen shape from which a host that plays sideways sets a run up in landscape. */
export const WIDE_FROM = 1.2;

export interface Viewport {
  /** Screen pixels per world unit. */
  scale: number;
  /** Visible world size, in world units. */
  viewW: number;
  viewH: number;
  /** The play area in screen pixels; the rest of the screen is side bars. */
  playX: number;
  playY: number;
  playW: number;
  playH: number;
}

export function computeViewport(screenW: number, screenH: number, wide = false): Viewport {
  const aspect = screenW / screenH;
  const playAspect = wide
    ? Math.min(WIDE_MAX_ASPECT, Math.max(WIDE_MIN_ASPECT, aspect))
    : Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect));
  const playW = aspect > playAspect ? screenH * playAspect : screenW;
  const playH = aspect < playAspect ? screenW / playAspect : screenH;

  let viewW: number;
  let viewH: number;
  if (wide) {
    viewH = WIDE_VIEW_H;
    viewW = viewH * playAspect;
  } else if (playAspect <= PHONE_ASPECT) {
    viewW = DESIGN_W;
    viewH = DESIGN_W / playAspect;
  } else {
    const t = (playAspect - PHONE_ASPECT) / (MAX_ASPECT - PHONE_ASPECT);
    const zoom = 1 + (ZOOM_AT_WIDEST - 1) * t;
    viewH = DESIGN_H / zoom;
    viewW = viewH * playAspect;
  }

  return {
    scale: playH / viewH,
    viewW,
    viewH,
    playX: (screenW - playW) / 2,
    playY: (screenH - playH) / 2,
    playW,
    playH,
  };
}

/** Whether a run set up on this screen plays in landscape, on a host that plays sideways at all. */
export function wideScreen(screenW: number, screenH: number, sideways: boolean): boolean {
  return sideways && screenW >= screenH * WIDE_FROM;
}

/** The shortest side (CSS px) a sideways touch screen needs to play: a tablet's, not a phone's. */
export const SIDEWAYS_MIN_H = 600;

/**
 * A touch-only phone held sideways: its 3:4 frame would be a thumb-wide strip in the middle, so
 * it asks to be turned upright (Shell's upright cover). Tablets, like desktops and laptops, play
 * sideways in the 3:4 frame; upright is only what they are best at.
 */
export function wantsUpright(screenW: number, screenH: number, touchOnly: boolean): boolean {
  return touchOnly && screenW > screenH && screenH < SIDEWAYS_MIN_H;
}
