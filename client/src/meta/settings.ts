import { detectLocale, isLocale, type Locale } from '../i18n';
import { QUALITY_MODES, type QualityMode } from '../game/quality';
import type { KeyValueStore } from './saveStore';

// Device-only settings (docs/design.md: quality, volume and language stay local and are not
// part of the save): the language, the sound effects' volume and the render quality.

export const SETTINGS_KEY = 'hk.settings';

/** Volume steps; 0 is off, the top step is the mix's full level. */
export const VOLUME_STEPS = 5;

export interface Settings {
  /** Chosen in the settings panel; null follows the platform / browser language. */
  locale: Locale | null;
  /** Sound effects volume, 0 (off) to VOLUME_STEPS. */
  volume: number;
  /** Render quality; a ?quality= dev switch wins over it. */
  quality: QualityMode;
}

export const DEFAULT_SETTINGS: Settings = { locale: null, volume: VOLUME_STEPS, quality: 'auto' };

export function loadSettings(kv: KeyValueStore): Settings {
  try {
    const raw: unknown = JSON.parse(kv.getItem(SETTINGS_KEY) ?? '{}');
    const r = raw as { locale?: unknown; sound?: unknown; volume?: unknown; quality?: unknown } | null;
    const v = r?.volume;
    // files from before the volume steps only had sound on or off
    const volume = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= VOLUME_STEPS
      ? v
      : r?.sound === false ? 0 : VOLUME_STEPS;
    const q = r?.quality;
    const locale = r?.locale;
    return {
      locale: isLocale(locale) ? locale : null,
      volume,
      quality: QUALITY_MODES.includes(q as QualityMode) ? (q as QualityMode) : 'auto',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(kv: KeyValueStore, s: Settings): void {
  kv.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** Changes some settings and stores the result. */
export function updateSettings(kv: KeyValueStore, change: Partial<Settings>): Settings {
  const s = { ...loadSettings(kv), ...change };
  saveSettings(kv, s);
  return s;
}

/** Language order: saved setting, then the platform's language list, then English. */
export function pickLocale(s: Settings, languages: readonly string[]): Locale {
  return s.locale ?? detectLocale(languages);
}
