// Who is asked before the game sends play data (docs/store.md "Privacy"). Players in the EEA,
// the UK and Switzerland are asked first (GDPR and the ePrivacy rules on ids kept on a device):
// until they answer, events wait on the device and nothing goes out. Everyone else is told once,
// with a toast nobody has to tap, and can turn sharing off in the settings. Pure, so the rules
// are tested without a host.

export type PrivacyRegion = 'consent' | 'notice';
/** The player's answer, kept in the settings: none yet, yes or no. */
export type SharingChoice = 'ask' | 'yes' | 'no';
/** What the backend does with play data: send it, keep it on the device for now, or drop it. */
export type Sharing = 'send' | 'hold' | 'off';

/** The EU (Greece both as GR and EL), Iceland, Liechtenstein, Norway, the UK and Switzerland. */
const CONSENT_COUNTRIES = new Set(
  'AT BE BG HR CY CZ DK EE FI FR DE GR EL HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB UK CH'.split(' '),
);

/** Time zones outside Europe/* that are in those countries (the Azores, the Canaries, Madeira, Iceland, Svalbard). */
const CONSENT_ZONES = new Set(['Atlantic/Azores', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Reykjavik', 'Arctic/Longyearbyen']);

/**
 * The host's country when it knows one (CrazyGames does), else the device's time zone: every
 * Europe/* zone asks, which takes in a few countries that need not be asked, but none is missed.
 * With neither, the game asks.
 */
export function privacyRegion(country: string | null, timeZone: string | null): PrivacyRegion {
  if (country) return CONSENT_COUNTRIES.has(country.toUpperCase()) ? 'consent' : 'notice';
  if (!timeZone) return 'consent';
  return timeZone.startsWith('Europe/') || CONSENT_ZONES.has(timeZone) ? 'consent' : 'notice';
}

export function sharingOf(region: PrivacyRegion, choice: SharingChoice): Sharing {
  if (choice === 'yes') return 'send';
  if (choice === 'no') return 'off';
  return region === 'consent' ? 'hold' : 'send';
}

/** The privacy policy on the backend's host, in Chinese for a Chinese player, else in English. */
export function policyUrl(base: string, locale: string): string {
  return `${base}/privacy${locale.startsWith('zh') ? '?lang=zh' : ''}`;
}
