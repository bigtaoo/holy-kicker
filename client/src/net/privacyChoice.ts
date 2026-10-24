import { getLocale } from '../i18n';
import { policyUrl, privacyRegion, sharingOf, type PrivacyRegion } from '../meta/privacy';
import { loadSettings, updateSettings } from '../meta/settings';
import { THEME } from '../theme';
import type { Platform } from '../platform/types';
import { INSTALL_KEY, type Backend } from './backend';

// The player's privacy answer, applied to the backend and the host's own analytics (meta/privacy.ts
// has the rules): built only where the game has a backend, so offline builds and WeChat (until its
// backend is on, docs/wechat-ads.md) never ask. A host that blocks the backend (Playgama's sandbox)
// still asks, for its analytics. WeChat asks every player: China's PIPL wants consent, not a notice.

/** What the lobby's consent card and the settings panel read and change. */
export interface PrivacyUi {
  /** The lobby asks: a player in the EEA, the UK, Switzerland or on WeChat who has not answered yet. */
  asking(): boolean;
  /** Play data goes out now. */
  sharing(): boolean;
  set(on: boolean): void;
  /** Runs and the player's name go to the leaderboards: their own switch, apart from the play data. */
  boards(): boolean;
  setBoards(on: boolean): void;
  openPolicy(): void;
  /** The install's id once one is kept, for a request to see or delete its data; null before. */
  id(): string | null;
}

/** The device's time zone, e.g. 'Europe/Berlin'; null where the runtime has none. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export class PrivacyChoice implements PrivacyUi {
  readonly region: PrivacyRegion;

  constructor(
    private readonly net: Pick<Backend, 'setSharing' | 'setBoards'>,
    private readonly platform: Pick<Platform, 'host' | 'storage' | 'country' | 'openUrl'>,
    /** The backend's address, which serves the policy at /privacy. */
    private readonly base: string,
    timeZone: string | null,
  ) {
    this.region = platform.host === 'wechat' ? 'consent' : privacyRegion(platform.country(), timeZone);
    const s = loadSettings(platform.storage);
    net.setSharing(sharingOf(this.region, s.dataSharing));
    net.setBoards(s.boards);
  }

  asking(): boolean {
    return this.region === 'consent' && loadSettings(this.platform.storage).dataSharing === 'ask';
  }

  sharing(): boolean {
    return sharingOf(this.region, loadSettings(this.platform.storage).dataSharing) === 'send';
  }

  set(on: boolean): void {
    updateSettings(this.platform.storage, { dataSharing: on ? 'yes' : 'no' });
    this.net.setSharing(on ? 'send' : 'off');
  }

  boards(): boolean {
    return loadSettings(this.platform.storage).boards;
  }

  setBoards(on: boolean): void {
    updateSettings(this.platform.storage, { boards: on });
    this.net.setBoards(on);
  }

  /** The one-time toast is due: a player outside the consent region who has not seen it or answered. */
  noticeDue(): boolean {
    const s = loadSettings(this.platform.storage);
    return this.region === 'notice' && !s.noticeSeen && s.dataSharing === 'ask';
  }

  noticeShown(): void {
    updateSettings(this.platform.storage, { noticeSeen: true });
  }

  openPolicy(): void {
    this.platform.openUrl(policyUrl(this.base, getLocale(), THEME));
  }

  id(): string | null {
    return this.platform.storage.getItem(INSTALL_KEY);
  }
}
