import { freeLobbyArt, loadLobbyArt } from '../art';
import type { Art } from '../game/Game';
import type { Renderer } from 'pixi.js';
import type { Platform } from '../platform/types';
import { menuBackdrop } from './lobbyBars';

// The lobby's art for the shell: fetched once something asks for it, freed while a run plays (no
// run draws the lobby) and fetched again by the next lobby. A failed load gives a plain lobby
// rather than none. Its blurred menu courtyard is baked before it goes (menuBackdrop), for the
// screens around the run.

export class LobbyArtLoad {
  private load: Promise<void> | null = null;
  /** The last load has settled (in, or failed). */
  in = false;

  constructor(private readonly platform: Platform, private readonly art: Art, private readonly renderer: Renderer) {}

  /** The lobby's art, loading or in. */
  ready(): Promise<void> {
    if (!this.load) {
      const load: Promise<void> = loadLobbyArt(this.platform, this.art).catch((err: unknown) => console.error(err)).then(() => {
        // not if a run freed it meanwhile
        if (this.load === load) this.in = true;
      });
      this.load = load;
    }
    return this.load;
  }

  free(): void {
    menuBackdrop(this.renderer, this.art.lobby);
    freeLobbyArt(this.art);
    this.load = null;
    this.in = false;
  }
}
