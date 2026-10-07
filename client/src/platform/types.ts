import type { Application } from 'pixi.js';
import type { Host } from '@hk/protocol';
import type { MusicDeck } from '../audio/music';
import type { DragStick, Vec2 } from '../game/dragStick';
import type { DeviceInfo } from '../game/quality';
import type { KeyValueStore } from '../meta/saveStore';

// What the game needs from each host (web browser, CrazyGames, WeChat mini-game).
// Screen coordinates everywhere are logical pixels, the same units as app.screen.
export interface Platform {
  /** Which host this is, as the backend names it (analytics, leaderboard runs). */
  readonly host: Host;
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
  /** Reads a binary file shipped with the game (the sound samples). */
  readBinary(path: string): Promise<ArrayBuffer>;
  /**
   * Makes a chapter's art pack readable (art/<name>/): a WeChat subpackage is fetched first,
   * since the main package is capped at 4 MB; on the web the files are always there.
   */
  loadPack(name: string): Promise<void>;
  /** Where the save and the settings live. Never throws (wrap in SafeStore). */
  readonly storage: KeyValueStore;
  /** The player's languages, most preferred first (BCP 47 tags or WeChat's 'zh_CN'). */
  languages(): string[];
  /** Screen bands at the top and bottom the UI must keep clear (status bar, notch, WeChat's
   *  menu capsule, the home indicator), in the same units as app.screen. */
  safeInsets(): Insets;
  /** The game went to the background (tab hidden, app switched, a call came in). */
  onHide(cb: () => void): void;
  readonly portal: Portal;
  readonly ads: Ads;
  /** The lobby's banner ad; NO_BANNER where the host has none. */
  readonly banner: Banner;
  /** Sound output; null where the host has none (the game then runs silent). */
  readonly audio: AudioHost | null;
  /** Asks the player to write something (a problem report) in the host's own text box; null when cancelled. */
  askText(o: TextAsk): Promise<string | null>;
  /** One line naming the device for a problem report: the user agent, or the phone's model and system. */
  device(): string;
  /** The player's country (ISO 3166 alpha-2, e.g. 'DE') where the host knows it, else null. */
  country(): string | null;
  /** Opens a web page (the privacy policy) in a new tab; a no-op where the host has no browser. */
  openUrl(url: string): void;
}

/** The text box's wording, already translated, and the longest text it takes. */
export interface TextAsk {
  title: string;
  prompt: string;
  placeholder: string;
  send: string;
  cancel: string;
  max: number;
}

export interface Insets {
  top: number;
  bottom: number;
}

/** What the sound effects need from a host. */
export interface AudioHost {
  /** A new Web Audio context, or null without one. Called once, from a gesture. */
  context(): AudioContext | null;
  /** A user gesture that may start audio (browsers keep a context suspended until one). */
  onGesture(cb: () => void): void;
  /** The game went to the background (false) or came back (true). */
  onFocus(cb: (focused: boolean) => void): void;
  /** The portal muted or unmuted the game from its own controls. */
  onHostMute(cb: (muted: boolean) => void): void;
  /** Two streaming players for the music (audio/music.ts), or null where the host cannot
   *  stream; `ctx` is the effects' context, which the web decks play through. */
  musicDecks(ctx: AudioContext): [MusicDeck, MusicDeck] | null;
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
  /** Whether players here have portal accounts: then a guest stays off the boards. */
  accounts(): boolean;
}

/**
 * Ads (docs/design.md "Ads and monetization"). Only called outside gameplay, so the game is
 * already stopped while one plays. `started` runs when the ad is actually on screen (an unfilled
 * request never calls it): the shell mutes the sound from then until the ad is over, as
 * CrazyGames asks (Sound.muteDuring).
 */
export interface Ads {
  /** Whether to offer a rewarded ad at all: false with an adblocker or no ad host, and then
   *  the offer is hidden rather than shown disabled. */
  rewardedAvailable(): Promise<boolean>;
  /** Plays a rewarded ad; true only when it finished and the reward may be paid. */
  rewarded(started?: () => void): Promise<boolean>;
  /** An interstitial at a natural break; resolves when it is over or was not shown. */
  midgame(started?: () => void): Promise<void>;
}

/**
 * A banner ad in a band along the bottom of the screen, under the UI rather than over it: the
 * shell keeps `height` clear like a safe-area inset while the banner is up. Only the lobby
 * shows one (CrazyGames: never in gameplay, only on screens open 5 s or more).
 */
export interface Banner {
  /** The band's height in app.screen units. */
  readonly height: number;
  /** Puts the banner up; resolves whether it is up (false with an adblocker or no ad host). */
  show(): Promise<boolean>;
  /** Takes it down and clears it. */
  hide(): void;
}

export const NO_BANNER: Banner = {
  height: 0,
  show: async () => false,
  hide() {},
};

/** For hosts without a portal. */
export const NO_PORTAL: Portal = {
  loaded() {},
  gameplayStart() {},
  gameplayStop() {},
  celebrate() {},
  userName: () => null,
  accounts: () => false,
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
  rewarded: (started) => {
    started?.();
    return new Promise((r) => setTimeout(() => r(true), 800));
  },
  midgame: (started) => {
    started?.();
    return new Promise((r) => setTimeout(r, 400));
  },
};
