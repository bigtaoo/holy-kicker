import type { DeviceInfo } from '../../game/quality';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import type { Host } from '@hk/protocol';
import type { Ads, AudioHost, Banner, Portal } from '../types';
import { BannerHost } from '../web/banner';
import { WebPlatform, browserStorage } from '../web/WebPlatform';
import { webAudioHost } from '../web/webAudio';
import { CrazyGamesSdk, type CgEnvironment } from './sdk';

// The CrazyGames host: the browser host plus the SDK for saves, ads (the lobby banner too), the
// gameplay brackets and the signed-in username (docs/design.md "Platforms, saves and server").
//
// Built with `create()`, which waits (bounded) for the SDK before anything else, because the
// data module only exists after init: reading the save before that would read the wrong store.
export class CrazyGamesPlatform extends WebPlatform {
  override readonly host: Host;
  override readonly storage: KeyValueStore;
  override readonly portal: Portal;
  override readonly ads: Ads;
  override readonly banner: Banner;
  override readonly audio: AudioHost | null;
  /** Called after a guest signs in or a user signs out, once the new name is known. */
  onAccountChange: () => void = () => {};
  private name: string | null = null;

  private constructor(readonly sdk: CrazyGamesSdk, env: CgEnvironment) {
    super();
    // the SDK's local environment is a developer's own preview (npm run preview:crazygames): it
    // reports to the backend as web, like every other test install, so the crazygames numbers
    // are players only
    this.host = env === 'local' ? 'web' : 'crazygames';
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
      accounts: () => sdk.accountsAvailable(),
      canSignIn: () => false,
      signIn() {},
    };
    // the browser's audio, plus the portal's own mute button
    const web = webAudioHost();
    this.audio = web && { ...web, onHostMute: (cb) => sdk.onMuteChange(cb) };
    // no offer, banner or break ad where none can play: Basic Launch or an adblocker
    const adsOk = async () => sdk.isEnabled() && sdk.adsAllowed() && !(await sdk.hasAdblock());
    this.banner = new BannerHost({
      available: adsOk,
      request: (id, width, height) => sdk.requestBanner(id, width, height),
      clear: (id) => sdk.clearBanner(id),
    });
    this.ads = {
      rewardedAvailable: adsOk,
      rewarded: (started) => sdk.requestAd('rewarded', { adStarted: started }),
      midgame: async (started) => {
        if (sdk.adsAllowed()) await sdk.requestAd('midgame', { adStarted: started });
      },
      adFree: () => false,
    };
  }

  /** The portal's locale alone when it has one: CrazyGames asks for that, falling back to
   *  English rather than to the browser's other languages. */
  override languages(): string[] {
    const portal = this.sdk.locale();
    return portal ? [portal] : super.languages();
  }

  /** The portal's country, which decides whether the game asks before sending play data. */
  override country(): string | null {
    return this.sdk.countryCode();
  }

  /** The portal's device type when it has one: it knows tablets the user agent hides. */
  override async probe(): Promise<DeviceInfo> {
    const info = await super.probe();
    const type = this.sdk.deviceType();
    return type ? { ...info, mobile: type !== 'desktop', tablet: type === 'tablet' } : info;
  }

  static async create(sdk = new CrazyGamesSdk()): Promise<CrazyGamesPlatform> {
    const env = await sdk.init();
    sdk.loadingStart();
    const platform = new CrazyGamesPlatform(sdk, env);
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
