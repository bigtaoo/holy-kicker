import { Container, Graphics } from 'pixi.js';
import { getLocale, loadLocale, localeName, setLocale, t, type Key, type Locale } from '../i18n';
import { QUALITY_MODES, type QualityMode } from '../game/quality';
import type { Sound } from '../audio/Sound';
import type { KeyValueStore } from '../meta/saveStore';
import type { CloudUi } from '../net/cloudSync';
import type { PrivacyUi } from '../net/privacyChoice';
import type { AdPrivacy, Portal } from '../platform/types';
import { loadSettings, updateSettings, VOLUME_STEPS } from '../meta/settings';
import { cloudRows } from './cloudRows';
import { languagePanel } from './languagePanel';
import type { ReminderUi } from './reminders';
import { COLORS, backdrop, button, fit, label, panel, playTap } from './widgets';
import { toggle } from './toggle';

// The settings panel, opened from the lobby's gear: language (a button to the picker,
// languagePanel.ts) beside the screen shake on or off, the sound effects' and the
// music's volume in steps (0 is off), the graphics quality and, online, play data: sharing on or off,
// the privacy policy (and beside it the ad network's privacy options where they are due, iOS in
// the EEA/UK) and the install's id, then the cloud save (cloudRows.ts), and beside Back a Game
// Center button while Apple's sign-in waits for a tap (iOS). Every change goes straight to the
// shell, which stores it and redraws the lobby, so the panel just shows the current values.

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
  /** The cloud save's backup and restore (net/cloudSync.ts); unset where the host has a cloud of its own or is offline. */
  cloud?: CloudUi | null;
  /** The build shown at the bottom (__HK_BUILD__); tapped TESTER_TAPS times it marks the install a tester. */
  version: string;
  tester(): boolean;
  markTester(): void;
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
  o: Pick<SettingsActions, 'setLanguage' | 'setQuality' | 'privacy' | 'account' | 'adPrivacy' | 'copyId' | 'reminders' | 'cloud' | 'version' | 'tester' | 'markTester'> & { canVibrate: boolean },
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
    cloud: o.cloud,
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

/** Sharing on or off and the policy side by side (and the ad network's options, when due), then
 *  what is sent and the install's id. */
function dataRows(
  p: PrivacyUi, ads: AdPrivacy, copyId: SettingsActions['copyId'],
  add: (c: Container, step: number) => void, heading: (text: string) => void,
): void {
  heading(t('settings.data'));
  const row = new Container();
  const n = ads.offered() ? 3 : 2;
  const bw = (ROW + 160 - 24 * (n - 1)) / n;
  const on = p.sharing();
  const share = button(on ? t('settings.shareOn') : t('settings.shareOff'), bw, 110, () => p.set(!on), {
    fill: on ? COLORS.saffron : COLORS.panelLocked,
    textFill: on ? COLORS.outline : COLORS.text,
    size: 48,
  });
  const policy = button(t('settings.policy'), bw, 110, () => p.openPolicy(), { fill: COLORS.panelLocked, size: 48 });
  row.addChild(share, policy);
  if (n === 3) row.addChild(button(t('settings.adPrivacy'), bw, 110, () => ads.open(), { fill: COLORS.panelLocked, size: 48 }));
  row.children.forEach((b, i) => (b.x = (i - (n - 1) / 2) * (bw + 24)));
  add(row, 140);
  const id = p.id();
  const style = { wordWrap: true, wordWrapWidth: W - 100, breakWords: true };
  const notice = label(t('settings.dataNotice'), 48, COLORS.dim, style);
  if (!id) return add(notice, notice.height + 40);
  add(notice, notice.height + 16);
  // the ID on a line of its own, which copies itself when tapped (players quote it in a problem)
  const line = label(t('settings.playId', { id }), 48, copyId ? COLORS.text : COLORS.dim, style);
  if (copyId) {
    line.eventMode = 'static';
    line.cursor = 'pointer';
    line.on('pointertap', () => {
      playTap();
      void copyId(id);
    });
  }
  add(line, line.height + 30);
}

/** The reminders' switch under a heading that says whether they are on; refused in the phone's
 *  settings, only the heading, since a tap here cannot undo that. */
function reminderRow(r: ReminderUi, add: (c: Container, step: number) => void, heading: (text: string) => void): void {
  const state = r.state();
  heading(t(`remind.${state}`));
  if (state === 'blocked') return;
  add(toggle(state === 'on', ROW + 160, (on) => void r.set(on)), 140);
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
  shake.x = half;
  row.addChild(lang, shake);
  return { heads, row };
}

export function settingsPanel(w: number, h: number, a: SettingsActions): Container {
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
  if (a.haptics) {
    const on = a.haptics.on();
    heading(t(on ? 'settings.hapticsOn' : 'settings.hapticsOff'));
    add(toggle(on, ROW + 160, (v) => a.haptics!.set(v)), 140);
  }

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

  if (a.reminders) reminderRow(a.reminders, add, heading);
  if (a.privacy) dataRows(a.privacy, a.adPrivacy, a.copyId, add, heading);
  if (a.cloud) {
    heading(t('cloud.title'));
    const rows = cloudRows(a.cloud, ROW + 160);
    add(rows.view, rows.height);
  }

  y += 40;
  const back = button(t('common.back'), 400, 110, () => a.close(), { fill: COLORS.panelLocked });
  if (a.account.canSignIn()) {
    // no room for a row of its own on a 16:9 phone, and it is rarely there: Game Center signs
    // most players in by itself
    const row = new Container();
    const gc = button(t('settings.gameCenter'), 400, 110, () => a.account.signIn(), { fill: COLORS.panelLocked, size: 48 });
    gc.x = -210;
    back.x = 210;
    row.addChild(gc, back);
    add(row, 110);
  } else add(back, 110);
  add(versionLine(a), 70);
  // the box is as tall as its rows, centred, and shrinks on a frame too short for it
  const boxH = y + 50;
  box.children.forEach((c) => (c.y -= boxH / 2));
  box.addChildAt(panel(W, boxH), 0);
  box.scale.set(Math.min(1, (h - 40) / boxH));
  view.addChild(box);
  return view;
}
