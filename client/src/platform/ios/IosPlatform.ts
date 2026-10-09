import type { Host } from '@hk/protocol';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import { NO_PORTAL, type AdPrivacy, type Ads, type Portal, type Store, type TextAsk } from '../types';
import { WebPlatform, browserStorage } from '../web/WebPlatform';
import { adFree } from './adFree';
import { AdMob } from './admob';
import { hkNative, type HKNative } from './bridge';
import { GameCenterAccount } from './gameCenter';
import { MirrorStore } from './mirrorStore';
import { StoreKit } from './storeKit';

// The iOS app (docs/ios.md): the browser host inside the Capacitor shell's WKWebView, with the
// shell's bridge (window.HKNative) for what a web view cannot do on its own. Without the bridge
// (the page opened in Safari) it behaves exactly like the browser host, reporting as ios.
//
// Game Center names the player on the boards, but it is not an account the boards require
// (`accounts()` is false): a player without it goes by a dice name, as on the web. Ads are AdMob's,
// through the shell (admob.ts), until the ad-free card is bought through StoreKit (storeKit.ts,
// adFree.ts); in Safari, without the shell, there are neither.
export class IosPlatform extends WebPlatform {
  override readonly host: Host = 'ios';
  override readonly storage: KeyValueStore;
  override readonly portal: Portal;
  override readonly ads: Ads;
  override readonly adPrivacy: AdPrivacy;
  override readonly store: Store | null;
  /** main.ios.ts redraws the lobby on its `onChange`. */
  readonly gameCenter: GameCenterAccount;
  /** main.ios.ts redraws the lobby on its `onChange` too. */
  readonly storeKit: StoreKit;
  private readonly native: Partial<HKNative> | null;
  private readonly admob: AdMob;

  constructor(native = hkNative()) {
    super();
    this.native = native;
    const save = native?.save;
    this.storage = new SafeStore(
      native?.saved && save ? new MirrorStore(native.saved, (k, v) => save.call(native, k, v), browserStorage()) : browserStorage(),
    );
    const gc = new GameCenterAccount(native);
    this.gameCenter = gc;
    this.portal = {
      ...NO_PORTAL,
      userName: () => gc.alias(),
      canSignIn: () => gc.canSignIn(),
      signIn: () => gc.signIn(),
    };
    this.admob = new AdMob(native);
    const storeKit = new StoreKit(native, this.storage);
    this.storeKit = storeKit;
    this.store = storeKit.available() ? storeKit : null;
    this.ads = adFree(this.admob, () => storeKit.owned());
    this.adPrivacy = this.admob;
    // game sound obeys the silent switch and mixes with the player's music (iOS 17+; the shell
    // sets the same AVAudioSession category for older systems)
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
  }

  override openUrl(url: string): void {
    if (this.native?.openUrl) this.native.openUrl(url);
    else super.openUrl(url);
  }

  /** The phone's languages: WKWebView's navigator.language only knows the app's own localisations. */
  override languages(): string[] {
    const langs = this.native?.languages;
    return Array.isArray(langs) && langs.length ? [...langs] : super.languages();
  }

  /** With why ads last failed to load, if they did: no fill and a wrong unit look alike otherwise. */
  override device(): string {
    const device = this.native?.device || super.device();
    const error = this.admob.error();
    return error ? `${device}; ads: ${error}` : device;
  }

  /** The keyboard can leave the page scrolled up after it closes, which offsets every later tap
   *  on the canvas (funny IOS_RELEASE §10.6): scroll back now and once more after it has gone. */
  override async askText(o: TextAsk): Promise<string | null> {
    const text = await super.askText(o);
    window.scrollTo(0, 0);
    setTimeout(() => window.scrollTo(0, 0), 400);
    return text;
  }
}
