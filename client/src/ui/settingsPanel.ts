import { Container, Graphics } from 'pixi.js';
import { getLocale, loadLocale, localeName, setLocale, t, type Key, type Locale } from '../i18n';
import { QUALITY_MODES, type QualityMode } from '../game/quality';
import type { Sound } from '../audio/Sound';
import type { KeyValueStore } from '../meta/saveStore';
import type { PrivacyUi } from '../net/privacyChoice';
import type { AdPrivacy, Portal } from '../platform/types';
import { loadSettings, updateSettings, VOLUME_STEPS } from '../meta/settings';
import { accountOffered, accountPanel } from './accountPanel';
import { languagePanel } from './languagePanel';
import type { ReminderUi } from './reminders';
import { COLORS, backdrop, button, fit, label, panel, playTap } from './widgets';
import { toggle } from './toggle';

// The settings panel, opened from the lobby's gear: language (a button to the picker,
// languagePanel.ts) beside the screen shake on or off, the sound effects' and the music's volume
// in steps (0 is off), the graphics quality, the reminders and vibration where the device has
// them, then "Account & data" (a second panel, accountPanel.ts: play data, the privacy policy,
// the play ID) beside Back, with a Game Center button while Apple's sign-in waits for a tap (iOS).
// Every change goes straight to the shell, which stores it and redraws the lobby, so the panel
// just shows the current values.

export interface SettingsActions {
  setLanguage(locale: Locale): void;
  volume(): number;
  setVolume(volume: number): void;
  music(): number;
  setMusic(volume: number): void;
  quality(): QualityMode;
  setQuality(mode: QualityMode): void;
  shake(): boolean;
  setShake(on: boolean): void;
  /** Vibration on level-ups and hits; unset where the device cannot buzz. */
  haptics?: { on(): boolean; set(on: boolean): void };
  /** Where the game talks to its backend, the player's privacy answer (net/privacyChoice.ts); null offline. */
  privacy: PrivacyUi | null;
  /** Signing in to the host's account from here (Game Center); never offered elsewhere. */
  account: Pick<Portal, 'canSignIn' | 'signIn'>;
  /** The ad network's own privacy options; shown with the play-data rows. */
  adPrivacy: AdPrivacy;
  /** Copies the play ID when it is tapped (false when the host refused); unset where there is no clipboard. */
  copyId?: (id: string) => Promise<boolean>;
  /** The iOS app's reminders (ui/reminders.ts); unset where the host has no notifications. */
  reminders?: ReminderUi;
  /** The build shown at the bottom (__HK_BUILD__); tapped TESTER_TAPS times it marks the install a tester. */
  version: string;
  tester(): boolean;
  markTester(): void;
  /** The second panel is open (the lobby keeps it across redraws). */
  accountOpen?: boolean;
  openAccount?(open: boolean): void;
  close(): void;
}

/** Taps on the version line that mark the install a tester (the dashboard leaves testers out, docs/experiments.md). */
export const TESTER_TAPS = 7;

/** Switches to `locale` and stores it, once its table is in (a chunk that failed to load keeps the current language). */
export async function keepLanguage(kv: KeyValueStore, locale: Locale): Promise<void> {
  if (!(await loadLocale(locale))) return;
  setLocale(locale);
  updateSettings(kv, { locale });
}

/** The panel's actions over the stored settings and the sound; a new language (once stored) or quality mode also goes to `o`. */
export function storedSettings(
  kv: KeyValueStore,
  sound: Pick<Sound, 'level' | 'musicLevel' | 'setVolume' | 'setMusicVolume'>,
  o: Pick<SettingsActions, 'setLanguage' | 'setQuality' | 'privacy' | 'account' | 'adPrivacy' | 'copyId' | 'reminders' | 'version' | 'tester' | 'markTester'> & { canVibrate: boolean },
): Omit<SettingsActions, 'close'> {
  return {
    setLanguage: (locale) => void keepLanguage(kv, locale).then(() => o.setLanguage(locale)),
    volume: () => sound.level,
    setVolume: (volume) => {
      sound.setVolume(volume);
      updateSettings(kv, { volume });
    },
    music: () => sound.musicLevel,
    setMusic: (music) => {
      sound.setMusicVolume(music);
      updateSettings(kv, { music });
    },
    quality: () => loadSettings(kv).quality,
    setQuality: (quality) => {
      updateSettings(kv, { quality });
      o.setQuality(quality);
    },
    shake: () => loadSettings(kv).shake,
    setShake: (shake) => updateSettings(kv, { shake }),
    haptics: o.canVibrate ? { on: () => loadSettings(kv).haptics, set: (haptics) => updateSettings(kv, { haptics }) } : undefined,
    privacy: o.privacy,
    account: o.account,
    adPrivacy: o.adPrivacy,
    copyId: o.copyId,
    reminders: o.reminders,
    version: o.version,
    tester: o.tester,
    markTester: o.markTester,
  };
}

/** The build, dim and small; TESTER_TAPS taps on it mark the install a tester, which the line then says. */
function versionLine(a: SettingsActions): Container {
  const text = () => (a.tester() ? t('settings.versionTester', { v: a.version }) : t('settings.version', { v: a.version }));
  const line = label(text(), 42, COLORS.dim);
  let taps = 0;
  line.eventMode = 'static';
  line.cursor = 'default';
  line.on('pointertap', () => {
    if (a.tester() || ++taps < TESTER_TAPS) return;
    a.markTester();
    line.text = text();
  });
  return line;
}

const W = 860;
const ROW = 600;
const HINT: Record<QualityMode, Key> = { auto: 'settings.autoHint', high: 'settings.highHint', saver: 'settings.saverHint' };

/** A row of equal choice buttons, the current one saffron. */
function choices<T>(items: readonly T[], name: (item: T) => string, current: T, pick: (item: T) => void): Container {
  const row = new Container();
  const gap = 24;
  const w = (ROW + 160 - gap * (items.length - 1)) / items.length;
  items.forEach((item, i) => {
    const on = item === current;
    const b = button(name(item), w, 110, () => pick(item), {
      fill: on ? COLORS.saffron : COLORS.panelLocked,
      textFill: on ? COLORS.outline : COLORS.text,
      size: 48,
    });
    b.x = -(ROW + 160) / 2 + w / 2 + i * (w + gap);
    row.addChild(b);
  });
  return row;
}

/** Minus, the volume steps as bars (each tappable), plus. */
function volumeRow(volume: number, set: (v: number) => void): Container {
  const row = new Container();
  const minus = button('−', 110, 110, () => set(Math.max(0, volume - 1)), { fill: COLORS.panelLocked });
  const plus = button('+', 110, 110, () => set(Math.min(VOLUME_STEPS, volume + 1)), { fill: COLORS.panelLocked });
  minus.x = -(ROW + 160) / 2 + 55;
  plus.x = (ROW + 160) / 2 - 55;
  row.addChild(minus, plus);
  const span = ROW + 160 - 2 * 110 - 2 * 30;
  const bw = span / VOLUME_STEPS;
  for (let i = 1; i <= VOLUME_STEPS; i++) {
    const h = 36 + i * 14;
    const x = -span / 2 + (i - 1) * bw;
    const bar = new Graphics()
      .roundRect(x + 8, 50 - h, bw - 16, h, 10)
      .fill(i <= volume ? COLORS.saffron : COLORS.panelLocked)
      .stroke({ color: COLORS.outline, width: 6 });
    // the whole column is the hit area, so a short bar is as easy to tap as a tall one
    bar.hitArea = { contains: (px: number, py: number) => px >= x && px < x + bw && py >= -60 && py <= 60 };
    bar.eventMode = 'static';
    bar.cursor = 'pointer';
    bar.on('pointertap', () => {
      playTap();
      set(i === volume ? i - 1 : i);
    });
    row.addChild(bar);
  }
  return row;
}

/** A heading over a switch (or over nothing). */
type Switch = { head: string; on: boolean | null; set: (on: boolean) => void };

/** The reminders and the vibration, side by side when both are there, each a switch under a
 *  heading that says whether it is on. Reminders refused in the phone's settings show only the
 *  heading, since a tap here cannot undo that. */
function switchRows(a: SettingsActions, add: (c: Container, step: number) => void): void {
  const items: Switch[] = [];
  const r = a.reminders;
  if (r) {
    const state = r.state();
    items.push({ head: t(`remind.${state}`), on: state === 'blocked' ? null : state === 'on', set: (on) => void r.set(on) });
  }
  const v = a.haptics;
  if (v) items.push({ head: t(v.on() ? 'settings.hapticsOn' : 'settings.hapticsOff'), on: v.on(), set: (on) => v.set(on) });
  if (!items.length) return;
  const heads = new Container();
  const row = new Container();
  const bw = (ROW + 160 - 24 * (items.length - 1)) / items.length;
  items.forEach((s, i) => {
    const x = (i - (items.length - 1) / 2) * (bw + 24);
    const head = fit(label(s.head, 48, COLORS.dim), bw);
    head.x = x;
    heads.addChild(head);
    if (s.on === null) return;
    const sw = toggle(s.on, bw, s.set);
    sw.x = x;
    row.addChild(sw);
  });
  add(heads, 90);
  if (row.children.length) add(row, 140);
}

/** The language (a button to the picker) and, beside it, the screen shake as a switch, each
 *  under a heading of its own (the shake's says whether it is on). */
function topRow(view: Container, w: number, h: number, a: SettingsActions): { heads: Container; row: Container } {
  const heads = new Container();
  const row = new Container();
  const bw = (ROW + 160 - 24) / 2;
  const half = (bw + 24) / 2;
  const on = a.shake();
  const left = fit(label(t('settings.language'), 48, COLORS.dim), bw);
  const right = fit(label(on ? t('settings.shakeOn') : t('settings.shakeOff'), 48, COLORS.dim), bw);
  left.x = -half;
  right.x = half;
  heads.addChild(left, right);
  const lang = button(localeName(getLocale()), bw, 110, () => {
    const picker = languagePanel(w, h, (l) => a.setLanguage(l), () => picker.destroy({ children: true }));
    view.addChild(picker);
  }, { fill: COLORS.panelLocked, size: 48 });
  lang.x = -half;
  const shake = toggle(on, bw, (v) => a.setShake(v));
  shake.label = 'shake'; // a switch alone: tests find it by name
  shake.x = half;
  row.addChild(lang, shake);
  return { heads, row };
}

/** "Account & data" beside Back and, while Apple's sign-in waits for a tap, Game Center (rarely
 *  there: Game Center signs most players in by itself). */
function bottomRow(a: SettingsActions): Container {
  const row = new Container();
  const items: [string, () => void][] = [];
  if (a.account.canSignIn()) items.push([t('settings.gameCenter'), () => a.account.signIn()]);
  if (a.openAccount && accountOffered(a)) items.push([t('settings.account'), () => a.openAccount!(true)]);
  const backW = items.length ? (items.length > 1 ? 220 : 300) : 400;
  const bw = items.length ? (ROW + 160 - backW - 24 * items.length) / items.length : 0;
  let x = -(ROW + 160) / 2;
  for (const [text, tap] of items) {
    const b = button(text, bw, 110, tap, { fill: COLORS.panelLocked, size: 48 });
    b.x = x + bw / 2;
    x += bw + 24;
    row.addChild(b);
  }
  const back = button(t('common.back'), backW, 110, () => a.close(), { fill: COLORS.panelLocked });
  back.x = items.length ? x + backW / 2 : 0;
  row.addChild(back);
  return row;
}

export function settingsPanel(w: number, h: number, a: SettingsActions): Container {
  if (a.accountOpen) return accountPanel(w, h, a, () => a.openAccount?.(false));
  const view = new Container();
  view.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  let y = 0;
  const add = (c: Container, step: number) => {
    c.y = y + step / 2;
    box.addChild(c);
    y += step;
  };
  const heading = (text: string) => add(fit(label(text, 48, COLORS.dim), W - 80), 90);

  y += 30;
  add(label(t('settings.title'), 64), 110);
  const top = topRow(view, w, h, a);
  add(top.heads, 90);
  add(top.row, 150);

  const volume = a.volume();
  heading(volume === 0 ? t('settings.off') : t('settings.level', { n: Math.round((100 * volume) / VOLUME_STEPS) }));
  add(volumeRow(volume, (v) => a.setVolume(v)), 150);
  const music = a.music();
  heading(music === 0 ? t('settings.musicOff') : t('settings.musicLevel', { n: Math.round((100 * music) / VOLUME_STEPS) }));
  add(volumeRow(music, (v) => a.setMusic(v)), 150);

  const mode = a.quality();
  heading(t('settings.quality'));
  add(choices(QUALITY_MODES, (m) => t(`settings.${m}`), mode, (m) => a.setQuality(m)), 140);
  const hint = label(t(HINT[mode]), 48, COLORS.dim, { wordWrap: true, wordWrapWidth: W - 60, breakWords: true });
  add(hint, hint.height + 30);

  switchRows(a, add);

  y += 40;
  add(bottomRow(a), 110);
  add(versionLine(a), 70);
  // the box is as tall as its rows, centred, and shrinks on a frame too short for it
  const boxH = y + 50;
  box.children.forEach((c) => (c.y -= boxH / 2));
  box.addChildAt(panel(W, boxH), 0);
  box.scale.set(Math.min(1, (h - 40) / boxH));
  view.addChild(box);
  return view;
}
