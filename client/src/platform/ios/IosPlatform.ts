import type { Host } from '@hk/protocol';
import { SafeStore, type KeyValueStore } from '../../meta/saveStore';
import type { TextAsk } from '../types';
import { WebPlatform, browserStorage } from '../web/WebPlatform';
import { hkNative, type HKNative } from './bridge';
import { MirrorStore } from './mirrorStore';

// The iOS app (docs/ios.md): the browser host inside the Capacitor shell's WKWebView, with the
// shell's bridge (window.HKNative) for what a web view cannot do on its own. Without the bridge
// (the page opened in Safari) it behaves exactly like the browser host, reporting as ios.
export class IosPlatform extends WebPlatform {
  override readonly host: Host = 'ios';
  override readonly storage: KeyValueStore;
  private readonly native: Partial<HKNative> | null;

  constructor(native = hkNative()) {
    super();
    this.native = native;
    const save = native?.save;
    this.storage = new SafeStore(
      native?.saved && save ? new MirrorStore(native.saved, (k, v) => save.call(native, k, v), browserStorage()) : browserStorage(),
    );
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

  override device(): string {
    return this.native?.device || super.device();
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
