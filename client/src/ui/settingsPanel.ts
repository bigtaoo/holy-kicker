import { Container, Graphics } from 'pixi.js';
import { getLocale, localeName, t, type Key, type Locale } from '../i18n';
import { QUALITY_MODES, type QualityMode } from '../game/quality';
import type { Sound } from '../audio/Sound';
import type { KeyValueStore } from '../meta/saveStore';
import type { PrivacyUi } from '../net/privacyChoice';
import type { Portal } from '../platform/types';
import { loadSettings, updateSettings, VOLUME_STEPS } from '../meta/settings';
import { languagePanel } from './languagePanel';
import { COLORS, backdrop, button, fit, label, panel, playTap } from './widgets';

// The settings panel, opened from the lobby's gear: language (a button to the picker,
// languagePanel.ts), the sound effects' and the
// music's volume in steps (0 is off), the graphics quality and, online, play data: sharing on or off,
// the privacy policy and the install's id, and beside Back a Game Center button while Apple's
// sign-in waits for a tap (iOS). Every change goes straight to the shell, which stores it and
// redraws the lobby, so the panel just shows the current values.

export interface SettingsActions {
  setLanguage(locale: Locale): void;
  volume(): number;
  setVolume(volume: number): void;
  music(): number;
  setMusic(volume: number): void;
  quality(): QualityMode;
  setQuality(mode: QualityMode): void;
  /** Where the game talks to its backend, the player's privacy answer (net/privacyChoice.ts); null offline. */
  privacy: PrivacyUi | null;
  /** Signing in to the host's account from here (Game Center); never offered elsewhere. */
  account: Pick<Portal, 'canSignIn' | 'signIn'>;
  close(): void;
}

/** The panel's actions over the stored settings and the sound; a new language or quality mode also goes to `o`. */
export function storedSettings(
  kv: KeyValueStore,
  sound: Pick<Sound, 'level' | 'musicLevel' | 'setVolume' | 'setMusicVolume'>,
  o: Pick<SettingsActions, 'setLanguage' | 'setQuality' | 'privacy' | 'account'>,
): Omit<SettingsActions, 'close'> {
  return {
    setLanguage: o.setLanguage,
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
    privacy: o.privacy,
    account: o.account,
  };
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

/** Sharing on or off and the policy side by side, then what is sent and the install's id. */
function dataRows(p: PrivacyUi, add: (c: Container, step: number) => void, heading: (text: string) => void): void {
  heading(t('settings.data'));
  const row = new Container();
  const bw = (ROW + 160 - 24) / 2;
  const on = p.sharing();
  const share = button(on ? t('settings.shareOn') : t('settings.shareOff'), bw, 110, () => p.set(!on), {
    fill: on ? COLORS.saffron : COLORS.panelLocked,
    textFill: on ? COLORS.outline : COLORS.text,
    size: 44,
  });
  const policy = button(t('settings.policy'), bw, 110, () => p.openPolicy(), { fill: COLORS.panelLocked, size: 44 });
  share.x = -(bw + 24) / 2;
  policy.x = (bw + 24) / 2;
  row.addChild(share, policy);
  add(row, 140);
  const id = p.id();
  const text = t('settings.dataNotice') + (id ? '\n' + t('settings.playId', { id }) : '');
  add(label(text, 36, COLORS.dim, { wordWrap: true, wordWrapWidth: W - 100, breakWords: true }), 190);
}

export function settingsPanel(w: number, h: number, a: SettingsActions): Container {
  const view = new Container();
  view.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  const boxH = a.privacy ? 1790 : 1370;
  let y = -boxH / 2;
  box.addChild(panel(W, boxH));
  const add = (c: Container, step: number) => {
    c.y = y + step / 2;
    box.addChild(c);
    y += step;
  };
  const heading = (text: string) => add(fit(label(text, 48, COLORS.dim), W - 80), 90);

  y += 30;
  add(label(t('settings.title'), 64), 110);
  heading(t('settings.language'));
  add(button(localeName(getLocale()), ROW + 160, 110, () => {
    const picker = languagePanel(w, h, (l) => a.setLanguage(l), () => picker.destroy({ children: true }));
    view.addChild(picker);
  }, { fill: COLORS.panelLocked, size: 48 }), 150);

  const volume = a.volume();
  heading(volume === 0 ? t('settings.off') : t('settings.level', { n: Math.round((100 * volume) / VOLUME_STEPS) }));
  add(volumeRow(volume, (v) => a.setVolume(v)), 150);
  const music = a.music();
  heading(music === 0 ? t('settings.musicOff') : t('settings.musicLevel', { n: Math.round((100 * music) / VOLUME_STEPS) }));
  add(volumeRow(music, (v) => a.setMusic(v)), 150);

  const mode = a.quality();
  heading(t('settings.quality'));
  add(choices(QUALITY_MODES, (m) => t(`settings.${m}`), mode, (m) => a.setQuality(m)), 140);
  add(fit(label(t(HINT[mode]), 40, COLORS.dim), W - 80), 90);

  if (a.privacy) dataRows(a.privacy, add, heading);

  y += 40;
  const back = button(t('common.back'), 400, 110, () => a.close(), { fill: COLORS.panelLocked });
  if (a.account.canSignIn()) {
    // no room for a row of its own on a 16:9 phone, and it is rarely there: Game Center signs
    // most players in by itself
    const row = new Container();
    const gc = button(t('settings.gameCenter'), 400, 110, () => a.account.signIn(), { fill: COLORS.panelLocked, size: 44 });
    gc.x = -210;
    back.x = 210;
    row.addChild(gc, back);
    add(row, 110);
  } else add(back, 110);
  view.addChild(box);
  return view;
}
