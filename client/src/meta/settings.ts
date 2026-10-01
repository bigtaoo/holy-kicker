import { detectLocale, isLocale, type Locale } from '../i18n';
import type { KeyValueStore } from './saveStore';

// Device-only settings (docs/design.md: quality, volume and language stay local and are not
// part of the save). Only the language exists so far.

export const SETTINGS_KEY = 'hk.settings';

export interface Settings {
  /** Chosen in the settings panel; null follows the platform / browser language. */
  locale: Locale | null;
}

export function loadSettings(kv: KeyValueStore): Settings {
  try {
    const raw: unknown = JSON.parse(kv.getItem(SETTINGS_KEY) ?? '{}');
    const locale = (raw as { locale?: unknown } | null)?.locale;
    return { locale: isLocale(locale) ? locale : null };
  } catch {
    return { locale: null };
  }
}

export function saveSettings(kv: KeyValueStore, s: Settings): void {
  kv.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** Language order: saved setting, then the platform's language list, then English. */
export function pickLocale(s: Settings, languages: readonly string[]): Locale {
  return s.locale ?? detectLocale(languages);
}
