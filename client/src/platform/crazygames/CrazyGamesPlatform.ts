import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import type { Ads, Portal } from '../types';
import { WebPlatform, browserStorage } from '../web/WebPlatform';
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
    this.ads = {
      rewardedAvailable: async () => sdk.isEnabled() && !(await sdk.hasAdblock()),
      rewarded: () => sdk.requestAd('rewarded'),
      midgame: async () => {
        await sdk.requestAd('midgame');
      },
    };
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
