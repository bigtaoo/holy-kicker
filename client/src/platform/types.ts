import type { Application } from 'pixi.js';
import type { DragStick, Vec2 } from '../game/dragStick';
import type { DeviceInfo } from '../game/quality';
import type { KeyValueStore } from '../meta/saveStore';

// What the game needs from each host (web browser, CrazyGames, WeChat mini-game).
// Screen coordinates everywhere are logical pixels, the same units as app.screen.
export interface Platform {
  /** What the host says about the device before any GL context exists (gpu stays ''). */
  probe(): Promise<DeviceInfo>;
  /** MSAA is fixed for the context's lifetime, so it is chosen here. */
  createApp(msaa: boolean): Promise<Application>;
  /** Route touches (and on web, mouse drags) into the stick. Called once. */
  bindStick(app: Application, stick: DragStick): void;
  /** Extra movement source such as the keyboard; a zero vector when idle. */
  readKeys(): Vec2;
  /** Reads a text file shipped with the game (relative path, as for textures). */
  readText(path: string): Promise<string>;
  /**
   * Makes a chapter's art pack readable (art/<name>/): a WeChat subpackage is fetched first,
   * since the main package is capped at 4 MB; on the web the files are always there.
   */
  loadPack(name: string): Promise<void>;
  /** Where the save and the settings live. Never throws (wrap in SafeStore). */
  readonly storage: KeyValueStore;
  /** The player's languages, most preferred first (BCP 47 tags or WeChat's 'zh_CN'). */
  languages(): string[];
  readonly portal: Portal;
  readonly ads: Ads;
}

/** The host's session hooks; every method is a no-op where the host has none. */
export interface Portal {
  /** Boot has finished loading what the first screen needs. */
  loaded(): void;
  /** The player is playing (a run, not a menu or a pause). */
  gameplayStart(): void;
  gameplayStop(): void;
  /** A real achievement, e.g. a chapter clear. */
  celebrate(): void;
  /** The signed-in portal user's name, null for a guest or a host without accounts. */
  userName(): string | null;
}

/**
 * Ads (docs/design.md "Ads and monetization"). Only called outside gameplay, so the game is
 * already stopped while one plays. The game has no audio yet; once it does, mute it around
 * these calls.
 */
export interface Ads {
  /** Whether to offer a rewarded ad at all: false with an adblocker or no ad host, and then
   *  the offer is hidden rather than shown disabled. */
  rewardedAvailable(): Promise<boolean>;
  /** Plays a rewarded ad; true only when it finished and the reward may be paid. */
  rewarded(): Promise<boolean>;
  /** An interstitial at a natural break; resolves when it is over or was not shown. */
  midgame(): Promise<void>;
}

/** For hosts without a portal. */
export const NO_PORTAL: Portal = {
  loaded() {},
  gameplayStart() {},
  gameplayStop() {},
  celebrate() {},
  userName: () => null,
};

/** For hosts without ads: rewarded offers are hidden. */
export const NO_ADS: Ads = {
  rewardedAvailable: async () => false,
  rewarded: async () => false,
  midgame: async () => {},
};

/** Dev stand-in (?ads=fake): every ad "plays" for a moment and succeeds, so the reward and
 *  interstitial flows can be exercised without a portal. */
export const FAKE_ADS: Ads = {
  rewardedAvailable: async () => true,
  rewarded: () => new Promise((r) => setTimeout(() => r(true), 800)),
  midgame: () => new Promise((r) => setTimeout(r, 400)),
};
