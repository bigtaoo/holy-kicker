import type { Host, PropValue } from '@hk/protocol';
import type { DeviceInfo } from '../../game/quality';
import { RUN_KEY } from '../../meta/resume';
import { SAVE_KEY, SafeStore, type KeyValueStore } from '../../meta/saveStore';
import { SETTINGS_KEY } from '../../meta/settings';
import { INSTALL_KEY } from '../../net/backend';
import { SENT_KEY } from '../../ui/playerName';
import { NO_BANNER, NO_PORTAL, type Ads, type AudioHost, type Banner, type Portal } from '../types';
import { WebPlatform, browserStorage } from '../web/WebPlatform';
import { webAudioHost } from '../web/webAudio';
import { BridgeStore, PlaygamaBridge } from './bridge';

// The Playgama host: the browser host plus the Bridge SDK for saves, ads, the platform's pause and
// sound switches and the lifecycle messages (game_ready once the lobby is up, gameplay brackets).
// Built with `create()`, which waits (bounded) for Bridge and reads the save through it first.

/** Every key the game keeps in its store, read in one call at boot. */
const KEYS = [SAVE_KEY, SETTINGS_KEY, RUN_KEY, INSTALL_KEY, SENT_KEY];

/** Bridge's stand-ins for a page that is no portal: a developer's own preview and the QA tool. */
const TEST_PLATFORMS = new Set(['mock', 'qa_tool']);

export class PlaygamaPlatform extends WebPlatform {
  override readonly host: Host;
  override readonly storage: KeyValueStore;
  override readonly portal: Portal;
  override readonly ads: Ads;
  override readonly banner: Banner = NO_BANNER;
  override readonly audio: AudioHost | null;

  private constructor(private readonly bridge: PlaygamaBridge, store: BridgeStore | null) {
    super();
    const id = bridge.platformId();
    // a local preview reports to the backend as web, like every other test install
    this.host = id && !TEST_PLATFORMS.has(id) ? 'playgama' : 'web';
    this.storage = new SafeStore(store ?? browserStorage());
    this.portal = !bridge.isReady() ? NO_PORTAL : {
      ...NO_PORTAL,
      loaded: () => bridge.send('game_ready'),
      gameplayStart: () => bridge.send('gameplay_started'),
      gameplayStop: () => bridge.send('gameplay_stopped'),
      celebrate: () => bridge.send('player_got_achievement'),
    };
    // the browser's audio, plus the platform's own sound switch (it also turns off for ads)
    const web = webAudioHost();
    this.audio = web && { ...web, onHostMute: (cb) => bridge.onMute(cb) };
    const rewardedOk = async () => bridge.rewardedSupported() && !(await bridge.hasAdblock());
    this.ads = {
      rewardedAvailable: rewardedOk,
      rewarded: (started) => bridge.rewarded(started),
      midgame: (started) => bridge.interstitial(started),
      adFree: () => false,
    };
  }

  /** The platform's pause counts as going to the background too. */
  override onHide(cb: () => void): void {
    super.onHide(cb);
    this.bridge.onPause((paused) => paused && cb());
  }

  /** The platform's language first, then the browser's. */
  override languages(): string[] {
    const lang = this.bridge.language();
    return lang ? [lang, ...super.languages()] : super.languages();
  }

  override async probe(): Promise<DeviceInfo> {
    const info = await super.probe();
    const type = this.bridge.deviceType();
    return type ? { ...info, mobile: type === 'mobile' || type === 'tablet', tablet: type === 'tablet' } : info;
  }

  /** Which platform Bridge found and its version, for the `session` event. */
  sessionProps(): Record<string, PropValue> {
    return { sdk: `${this.bridge.platformId() ?? 'none'}/${this.bridge.version() ?? '?'}` };
  }

  static async create(bridge = new PlaygamaBridge()): Promise<PlaygamaPlatform> {
    const ok = await bridge.init();
    const store = ok ? await BridgeStore.create(bridge, KEYS) : null;
    console.info(`[holy-kicker] Playgama Bridge: ${ok ? bridge.platformId() : 'unavailable'}, save: ${store ? 'bridge' : 'localStorage'}`);
    return new PlaygamaPlatform(bridge, store);
  }
}
