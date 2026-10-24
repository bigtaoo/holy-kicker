import type { Container } from 'pixi.js';

// Where the main buttons sit, written onto the page for scripts that drive the game by input
// (build/smoke.mjs walks a release build through a run, the results, the lobby and the daily).
// The UI is all canvas, so a script has nothing to find a button by; each main button names
// itself here (`spot`), and `publishSpots` writes the screen's place and the shown buttons'
// centres, in CSS pixels of the page, as `data-hk-screen` and `data-hk-spots` on <html>. It reads
// nothing back and changes nothing a player sees, so release builds keep it; WeChat has no
// document and skips it.

const spots = new Map<string, Container>();

/** Names `view` as the button `name` while it is shown; returns the view. */
export function spot<T extends Container>(name: string, view: T): T {
  spots.set(name, view);
  return view;
}

/** True while `view` is on `stage`, visible, and takes taps. */
function shown(view: Container, stage: Container): boolean {
  if (view.destroyed || view.eventMode === 'none') return false;
  for (let v: Container | null = view; v; v = v.parent) {
    if (!v.visible || v.destroyed) return false;
    if (v === stage) return true;
  }
  return false;
}

/** The shown spots' centres in page pixels, given the canvas's rect and the stage's size. */
export function spotCentres(stage: Container, rect: { left: number; top: number; width: number; height: number }, stageW: number, stageH: number): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [name, view] of spots) {
    if (!shown(view, stage)) {
      if (view.destroyed) spots.delete(name);
      continue;
    }
    const b = view.getBounds();
    out[name] = [Math.round(rect.left + ((b.x + b.width / 2) * rect.width) / stageW), Math.round(rect.top + ((b.y + b.height / 2) * rect.height) / stageH)];
  }
  return out;
}

let last = 0;

/** Writes the place and the spots onto <html>, at most four times a second. */
export function publishSpots(place: string, stage: Container, canvas: HTMLCanvasElement, stageW: number, stageH: number, now: number): void {
  if (typeof document === 'undefined' || !document.documentElement?.dataset || now - last < 250) return;
  last = now;
  const html = document.documentElement;
  html.dataset.hkScreen = place;
  html.dataset.hkSpots = JSON.stringify(spotCentres(stage, canvas.getBoundingClientRect(), stageW, stageH));
}
