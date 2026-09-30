// Portrait viewport: maps the screen onto a 1080x1920 logical design.
//
// - Phones (aspect <= 9:16) show the full 1080 logical width; taller phones see more height.
// - Wider screens (desktop web) may widen the play area up to 3:4, and the camera zooms in
//   up to ZOOM_AT_WIDEST so characters stay readable in a small 16:9 portal iframe.
// - Beyond 3:4 the play area is pillarboxed; beyond MIN_ASPECT it is letterboxed.

export const DESIGN_W = 1080;
export const DESIGN_H = 1920;
export const PHONE_ASPECT = DESIGN_W / DESIGN_H; // 9:16
export const MAX_ASPECT = 3 / 4;
export const MIN_ASPECT = 9 / 22;
export const ZOOM_AT_WIDEST = 1.3;

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

export function computeViewport(screenW: number, screenH: number): Viewport {
  const aspect = screenW / screenH;
  const playAspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect));
  const playW = aspect > playAspect ? screenH * playAspect : screenW;
  const playH = aspect < playAspect ? screenW / playAspect : screenH;

  let viewW: number;
  let viewH: number;
  if (playAspect <= PHONE_ASPECT) {
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
