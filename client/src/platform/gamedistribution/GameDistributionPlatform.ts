import type { Host } from '@hk/protocol';
import type { Ads, AudioHost } from '../types';
import { WebPlatform } from '../web/WebPlatform';
import { webAudioHost } from '../web/webAudio';
import { GdSdk } from './sdk';

// The GameDistribution host: the browser host (its localStorage keeps the save) plus GD's own SDK
// for the ads. GameDistribution forbids any other network, analytics or outgoing link, so this host
// never reaches the backend (no boards, cloud save, reports or privacy page) and opens no page.
// Built with `create()`, which adds the SDK and waits (bounded) for it to be ready.
export class GameDistributionPlatform extends WebPlatform {
  override readonly host: Host = 'gamedistribution';
  override readonly ads: Ads;
  override readonly audio: AudioHost | null;
  readonly backendBlocked = true;

  private constructor(private readonly sdk: GdSdk) {
    super();
    // the SDK pauses the game for every ad, its own included: the sound goes off until it gives it back
    const web = webAudioHost();
    this.audio = web && { ...web, onHostMute: (cb) => sdk.onPause(cb) };
    this.ads = {
      rewardedAvailable: () => sdk.rewardedReady(),
      rewarded: (started) => sdk.showAd('rewarded', started),
      midgame: async (started) => void (await sdk.showAd('interstitial', started)),
      adFree: () => false,
    };
  }

  /** The SDK's pause counts as going to the background too, so a run stops under an ad. */
  override onHide(cb: () => void): void {
    super.onHide(cb);
    this.sdk.onPause((paused) => paused && cb());
  }

  /** No outgoing links on GameDistribution. */
  override openUrl(_url: string): void {}

  static async create(sdk = new GdSdk()): Promise<GameDistributionPlatform> {
    const how = await sdk.load();
    console.info(`[holy-kicker] GameDistribution SDK: ${how}`);
    return new GameDistributionPlatform(sdk);
  }
}
