import { Texture, type TextureSource } from 'pixi.js';
import type { SimState } from '@hk/engine';

// The art a first run of chapter 1 does not draw in its opening (art.ts LATE): on the web it
// comes in behind the first frame, a third of a megabyte less to wait for on a slow phone
// network. Until it lands, every texture of it is a placeholder the views already hold; the
// load fills them in place, so nothing has to be handed out again. A run that could draw one
// before then (lateHold) stands still, drawn, until it is in.

/** From the opening on, a run may draw late art: the fox runners come in wave 3, level 3 may deal an awakening's card. */
export const LATE_FROM = { wave: 2, level: 3 } as const;
/** Ms between tries of a failed late load. */
const RETRY_MS = 2000;

let ready = true;
let pending: Promise<void> = Promise.resolve();

/** Settles once the late art is in (at once where none was deferred). */
export function lateArt(): Promise<void> {
  return pending;
}

/** Whether the late art is in. */
export function lateArtReady(): boolean {
  return ready;
}

/** Starts `load`, trying again until it works (a lost request must not keep the fox away for good). */
export function loadLate(load: () => Promise<void>): Promise<void> {
  ready = false;
  pending = (async () => {
    for (;;) {
      try {
        await load();
        break;
      } catch (err) {
        console.warn('late art failed, trying again', err);
        await new Promise((done) => setTimeout(done, RETRY_MS));
      }
    }
    ready = true;
  })();
  return pending;
}

/** A texture to fill later: empty until `fill`, dynamic so the sprites drawing it follow the swap. */
export function placeholder(): Texture {
  return new Texture({ source: Texture.EMPTY.source, dynamic: true });
}

/** Marks the slices of a placeholder dynamic, so sprites made before the fill follow it too. */
export function toFill(textures: Iterable<Texture>): void {
  for (const t of textures) t.dynamic = true;
}

/** Points `textures` (placeholders or slices of one) at `source`, keeping their frames. */
export function fill(textures: Iterable<Texture>, source: TextureSource): void {
  for (const t of textures) {
    t.source = source;
    t.update();
  }
}

/** Whether `s` may draw late art: past the opening, or a relic or sutra a first run never has. */
export function mayNeedLate(s: Pick<SimState, 'wave' | 'config' | 'players'>): boolean {
  return s.wave >= LATE_FROM.wave || s.config.relic !== 'ball' || s.config.sutras.length > 0 || s.players.some((p) => p.level >= LATE_FROM.level);
}

/** Whether a run in `s` waits for the late art before its next step. */
export function lateHold(s: Pick<SimState, 'wave' | 'config' | 'players'>): boolean {
  return !ready && mayNeedLate(s);
}
