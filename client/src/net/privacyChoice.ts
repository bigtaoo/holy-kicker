import { getLocale } from '../i18n';
import { policyUrl, privacyRegion, sharingOf, type PrivacyRegion } from '../meta/privacy';
import { loadSettings, updateSettings } from '../meta/settings';
import type { Platform } from '../platform/types';
import { INSTALL_KEY, type Backend } from './backend';

// The player's privacy answer, applied to the backend (meta/privacy.ts has the rules): built only
// where the game talks to a backend, so offline builds and WeChat never ask.

/** What the lobby's consent card and the settings panel read and change. */
export interface PrivacyUi {
  /** The lobby asks: a player in the EEA, the UK or Switzerland who has not answered yet. */
  asking(): boolean;
  /** Play data goes out now. */
  sharing(): boolean;
  set(on: boolean): void;
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
    private readonly net: Pick<Backend, 'setSharing'>,
    private readonly platform: Pick<Platform, 'storage' | 'country' | 'openUrl'>,
    /** The backend's address, which serves the policy at /privacy. */
    private readonly base: string,
    timeZone: string | null,
  ) {
    this.region = privacyRegion(platform.country(), timeZone);
    net.setSharing(sharingOf(this.region, loadSettings(platform.storage).dataSharing));
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

  /** The one-time toast is due: a player outside the consent region who has not seen it or answered. */
  noticeDue(): boolean {
    const s = loadSettings(this.platform.storage);
    return this.region === 'notice' && !s.noticeSeen && s.dataSharing === 'ask';
  }

  noticeShown(): void {
    updateSettings(this.platform.storage, { noticeSeen: true });
  }

  openPolicy(): void {
    this.platform.openUrl(policyUrl(this.base, getLocale()));
  }

  id(): string | null {
    return this.platform.storage.getItem(INSTALL_KEY);
  }
}
