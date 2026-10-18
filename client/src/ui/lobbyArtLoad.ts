import { freeLobbyArt, loadLobbyArt } from '../art';
import type { Art } from '../game/Game';
import type { Platform } from '../platform/types';

// The lobby's art for the shell: fetched once something asks for it, freed while a run plays (no
// run draws the lobby) and fetched again by the next lobby. A failed load gives a plain lobby
// rather than none.

export class LobbyArtLoad {
  private load: Promise<void> | null = null;
  /** The last load has settled (in, or failed). */
  in = false;

  constructor(private readonly platform: Platform, private readonly art: Art) {}

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
    freeLobbyArt(this.art);
    this.load = null;
    this.in = false;
  }
}
