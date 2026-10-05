import type { Banner } from '../types';

// The DOM side of a banner ad (adapted from D:\daydayup\client\src\platform\crazygames\BannerHost.ts,
// which carries the live findings). The game is one canvas and a banner is an iframe the SDK
// puts into a container of ours, so there is a fixed <div> along the bottom of the page:
//  - it has an explicit size and the request names it: an unsized container made the SDK
//    answer "no available banner size has been found";
//  - 320x50 is the one standard size that fits every viewport the game allows;
//  - hiding also clears it, or the old creative flashes the next time it is shown;
//  - at most one request per 30 s (the platform's refresh floor): a lobby back sooner than
//    that gets its banner once the 30 s are up.
// It sits above the home indicator, and the shell keeps the band clear (Banner.height), so it
// covers none of the game's UI.

export const BANNER_ID = 'hk-banner';
export const BANNER_W = 320;
export const BANNER_H = 50;
export const BANNER_REFRESH_MS = 30_000;

/** What fills and clears the container: the SDK's banner module, or the dev stand-in. */
export interface BannerFill {
  /** Whether a banner may be requested at all (the SDK is up, no adblocker). */
  available(): Promise<boolean>;
  request(id: string, width: number, height: number): Promise<void>;
  clear(id: string): void;
}

/** The container, as far as the host needs it; null where there is no DOM. */
export interface BannerElement {
  setVisible(visible: boolean): void;
}

export function bannerElement(doc: Document = document): BannerElement | null {
  if (typeof doc?.createElement !== 'function') return null;
  let el = doc.getElementById(BANNER_ID);
  if (!el) {
    el = doc.createElement('div');
    el.id = BANNER_ID;
    el.style.cssText = `position:fixed;left:50%;bottom:env(safe-area-inset-bottom,0px);transform:translateX(-50%);`
      + `z-index:10;display:none;width:${BANNER_W}px;height:${BANNER_H}px`;
    doc.body.appendChild(el);
  }
  const div = el;
  return { setVisible: (visible) => void (div.style.display = visible ? 'block' : 'none') };
}

export class BannerHost implements Banner {
  readonly height = BANNER_H;
  private element: BannerElement | null | undefined;
  private visible = false;
  private lastRequest = -Infinity;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by hide(), so a show() still waiting on available() does not put it back up. */
  private generation = 0;

  constructor(
    private readonly fill: BannerFill,
    private readonly makeElement: () => BannerElement | null = () => bannerElement(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async show(): Promise<boolean> {
    const gen = this.generation;
    if (!(await this.fill.available()) || gen !== this.generation) return false;
    if (this.visible) return true;
    if (this.element === undefined) this.element = this.makeElement();
    if (!this.element) return false;
    this.element.setVisible(true);
    this.visible = true;
    const wait = this.lastRequest + BANNER_REFRESH_MS - this.now();
    if (wait <= 0) this.request();
    else this.timer = setTimeout(() => this.request(), wait);
    return true;
  }

  hide(): void {
    this.generation++;
    clearTimeout(this.timer);
    if (!this.visible || !this.element) return;
    this.element.setVisible(false);
    this.fill.clear(BANNER_ID);
    this.visible = false;
  }

  private request(): void {
    this.lastRequest = this.now();
    void this.fill.request(BANNER_ID, BANNER_W, BANNER_H);
  }
}

/** Dev stand-in (?ads=fake): a grey box where the banner would be. */
export const FAKE_BANNER_FILL: BannerFill = {
  available: async () => true,
  request: async (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.cssText += ';background:#888;color:#222;font:bold 20px sans-serif;text-align:center;line-height:50px';
    el.textContent = 'AD 320x50';
  },
  clear: (id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  },
};
