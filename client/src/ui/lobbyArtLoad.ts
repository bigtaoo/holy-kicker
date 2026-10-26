import { freeLobbyArt, loadLobbyArt } from '../art';
import type { Art } from '../game/Game';
import { TexturePool, type Renderer, type Texture } from 'pixi.js';
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

  /** Bakes the menu courtyard (and its landscape twin where runs can play sideways) and gives the portrait one. */
  bakeMenu(): Texture | null {
    if (this.platform.sideways) menuBackdrop(this.renderer, this.art.lobby, true);
    return menuBackdrop(this.renderer, this.art.lobby);
  }

  free(): void {
    this.bakeMenu();
    freeLobbyArt(this.art);
    // and its filters' screen-sized scratch textures, which Pixi's pool would keep for good (~30 MB at 2x)
    TexturePool.clear();
    this.load = null;
    this.in = false;
  }
}
