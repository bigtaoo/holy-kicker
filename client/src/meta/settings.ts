import { detectLocale, isLocale, type Locale } from '../i18n';
import { QUALITY_MODES, type QualityMode } from '../game/quality';
import type { SharingChoice } from './privacy';
import type { KeyValueStore } from './saveStore';

// Device-only settings (docs/design.md: quality, volume and language stay local and are not
// part of the save): the language, the sound effects' volume, the render quality,
// whether the screen shakes and the phone buzzes, the player's answer about play data (meta/privacy.ts) and
// about reminders (meta/reminders.ts).

export const SETTINGS_KEY = 'hk.settings';

/** Volume steps; 0 is off, the top step is the mix's full level. */
export const VOLUME_STEPS = 5;

export interface Settings {
  /** Chosen in the settings panel; null follows the platform / browser language. */
  locale: Locale | null;
  /** Sound effects volume, 0 (off) to VOLUME_STEPS. */
  volume: number;
  /** Music volume, 0 (off) to VOLUME_STEPS. */
  music: number;
  /** The levels the pause panel's switches turned effects and music off from: they come back on at these, in any later run. */
  keptVolume: number;
  keptMusic: number;
  /** Render quality; a ?quality= dev switch wins over it. */
  quality: QualityMode;
  /** The screen shakes on a big burst of kills (game/shake.ts). */
  shake: boolean;
  /** The phone buzzes on a level-up and when the hero is hurt, where it can (Platform.vibrate). */
  haptics: boolean;
  /** Whether play data may go to the backend: not answered yet, yes or no. */
  dataSharing: SharingChoice;
  /** Runs and the player's name go to the leaderboards (on unless the player turns it off; net/backend.ts). */
  boards: boolean;
  /** The one-time data toast (outside the EEA) has been shown. */
  noticeSeen: boolean;
  /** The iOS app's reminders (meta/reminders.ts), while the system allows them. */
  reminders: boolean;
  /** The lobby's reminder card has been answered (ui/reminders.ts). */
  remindAsked: boolean;
  /** A level-up card has explained the badge of what an item evolves with (ui/runWatch.ts). */
  pairsTold: boolean;
}

export const DEFAULT_SETTINGS: Settings = { locale: null, volume: VOLUME_STEPS, music: VOLUME_STEPS, keptVolume: VOLUME_STEPS, keptMusic: VOLUME_STEPS, quality: 'auto', shake: true, haptics: true, dataSharing: 'ask', boards: true, noticeSeen: false, reminders: true, remindAsked: false, pairsTold: false };

function isStep(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= VOLUME_STEPS;
}

export function loadSettings(kv: KeyValueStore): Settings {
  try {
    const raw: unknown = JSON.parse(kv.getItem(SETTINGS_KEY) ?? '{}');
    const r = raw as { locale?: unknown; sound?: unknown; volume?: unknown; music?: unknown; keptVolume?: unknown; keptMusic?: unknown; quality?: unknown; shake?: unknown; haptics?: unknown; dataSharing?: unknown; boards?: unknown; noticeSeen?: unknown; reminders?: unknown; remindAsked?: unknown; pairsTold?: unknown } | null;
    // files from before the volume steps only had sound on or off
    const v = r?.volume;
    const m = r?.music;
    const volume = isStep(v) ? v : r?.sound === false ? 0 : VOLUME_STEPS;
    const music = isStep(m) ? m : VOLUME_STEPS;
    const kept = (k: unknown) => (isStep(k) && k > 0 ? k : VOLUME_STEPS);
    const q = r?.quality;
    const locale = r?.locale;
    return {
      locale: isLocale(locale) ? locale : null,
      volume,
      music,
      keptVolume: kept(r?.keptVolume),
      keptMusic: kept(r?.keptMusic),
      quality: QUALITY_MODES.includes(q as QualityMode) ? (q as QualityMode) : 'auto',
      shake: r?.shake !== false,
      haptics: r?.haptics !== false,
      dataSharing: r?.dataSharing === 'yes' || r?.dataSharing === 'no' ? r.dataSharing : 'ask',
      boards: r?.boards !== false,
      noticeSeen: r?.noticeSeen === true,
      reminders: r?.reminders !== false,
      remindAsked: r?.remindAsked === true,
      pairsTold: r?.pairsTold === true,
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
