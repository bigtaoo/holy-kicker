import type { DeviceInfo } from '../../game/quality';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import type { Ads, AudioHost, Portal } from '../types';
import { WebPlatform, browserStorage } from '../web/WebPlatform';
import { webAudioHost } from '../web/webAudio';
import { CrazyGamesSdk } from './sdk';

// The CrazyGames host: the browser host plus the SDK for saves, ads, the gameplay brackets
// and the signed-in username (docs/design.md "Platforms, saves and server").
//
// Built with `create()`, which waits (bounded) for the SDK before anything else, because the
// data module only exists after init: reading the save before that would read the wrong store.
export class CrazyGamesPlatform extends WebPlatform {
  override readonly storage: KeyValueStore;
  override readonly portal: Portal;
  override readonly ads: Ads;
  override readonly audio: AudioHost | null;
  /** Called after a guest signs in or a user signs out, once the new name is known. */
  onAccountChange: () => void = () => {};
  private name: string | null = null;

  private constructor(readonly sdk: CrazyGamesSdk) {
    super();
    // guests and blocked third-party storage are the data module's job; without the SDK
    // (local dev, an adblocker) it falls back to localStorage
    const data = sdk.dataStore();
    this.storage = new SafeStore(data ?? browserStorage());
    this.portal = {
      loaded: () => sdk.loadingStop(),
      gameplayStart: () => sdk.gameplayStart(),
      gameplayStop: () => sdk.gameplayStop(),
      celebrate: () => sdk.happytime(),
      userName: () => this.name,
    };
    // the browser's audio, plus the portal's own mute button
    const web = webAudioHost();
    this.audio = web && { ...web, onHostMute: (cb) => sdk.onMuteChange(cb) };
    this.ads = {
      rewardedAvailable: async () => sdk.isEnabled() && !(await sdk.hasAdblock()),
      rewarded: () => sdk.requestAd('rewarded'),
      midgame: async () => {
        await sdk.requestAd('midgame');
      },
    };
  }

  /** The portal's locale alone when it has one: CrazyGames asks for that, falling back to
   *  English rather than to the browser's other languages. */
  override languages(): string[] {
    const portal = this.sdk.locale();
    return portal ? [portal] : super.languages();
  }

  /** The portal's device type when it has one: it knows tablets the user agent hides. */
  override async probe(): Promise<DeviceInfo> {
    const info = await super.probe();
    const type = this.sdk.deviceType();
    return type ? { ...info, mobile: type !== 'desktop' } : info;
  }

  static async create(sdk = new CrazyGamesSdk()): Promise<CrazyGamesPlatform> {
    const env = await sdk.init();
    sdk.loadingStart();
    const platform = new CrazyGamesPlatform(sdk);
    platform.name = await sdk.userName();
    sdk.onAuthChange(() => {
      void sdk.userName().then((name) => {
        platform.name = name;
        platform.onAccountChange();
      });
    });
    console.info(`[holy-kicker] CrazyGames SDK: ${env}, save: ${sdk.dataStore() ? 'data module' : 'localStorage'}`);
    return platform;
  }
}
