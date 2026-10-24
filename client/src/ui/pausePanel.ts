import { Container } from 'pixi.js';
import { getLocale, localeName, t } from '../i18n';
import type { Sound } from '../audio/Sound';
import { loadSettings, updateSettings } from '../meta/settings';
import type { KeyValueStore } from '../meta/saveStore';
import { toggle } from './toggle';
import { COLORS, backdrop, button, fit, keyCap, label, panel } from './widgets';
import { spot } from './spots';

// The in-run pause panel (RunHud.ts): resume, the sound switches (music, effects, screen shake and,
// where the phone can buzz, vibration), the language, report a problem, and give up, which asks
// for a second tap within GIVE_UP_WAIT before it ends the run.

export type Switch = 'music' | 'effects' | 'shake' | 'haptics';

export interface PauseSwitches {
  /** The switches this device offers, in the panel's order. */
  readonly list: readonly Switch[];
  on(s: Switch): boolean;
  set(s: Switch, on: boolean): void;
}

/** Seconds the give-up button waits for its second tap. */
export const GIVE_UP_WAIT = 3;

export interface PausePanelState {
  keys: boolean;
  /** The report button's text and whether it takes taps; null where a report could go nowhere. */
  report: { text: string; busy: boolean; note: { text: string; ok: boolean } | null } | null;
  /** The give-up button was tapped once and waits for the second. */
  confirming: boolean;
}

export interface PausePanelActions {
  resume(): void;
  languages(): void;
  report(): void;
  /** The first tap on give up (arms it) or the second (gives up). */
  giveUp(): void;
}

/** The switches over the stored settings: music and effects come back at the level they had, in this run or a later one. */
export function runSwitches(kv: KeyValueStore, sound: Pick<Sound, 'level' | 'musicLevel' | 'setVolume' | 'setMusicVolume'>, shake: { on: boolean }, canVibrate: boolean): PauseSwitches {
  return {
    list: canVibrate ? ['music', 'effects', 'shake', 'haptics'] : ['music', 'effects', 'shake'],
    on: (s) => (s === 'music' ? sound.musicLevel > 0 : s === 'effects' ? sound.level > 0 : s === 'shake' ? shake.on : loadSettings(kv).haptics),
    set: (s, on) => {
      if (s === 'music') {
        const keptMusic = sound.musicLevel || loadSettings(kv).keptMusic;
        const music = on ? keptMusic : 0;
        sound.setMusicVolume(music);
        updateSettings(kv, { music, keptMusic });
      } else if (s === 'effects') {
        const keptVolume = sound.level || loadSettings(kv).keptVolume;
        const volume = on ? keptVolume : 0;
        sound.setVolume(volume);
        updateSettings(kv, { volume, keptVolume });
      } else if (s === 'shake') {
        shake.on = on;
        updateSettings(kv, { shake: on });
      } else updateSettings(kv, { haptics: on });
    },
  };
}

const W = 760;
const CELL_W = 340;

/** Two switches a row, each under its name. */
function switchGrid(sw: PauseSwitches, redraw: () => void): Container {
  const grid = new Container();
  sw.list.forEach((s, i) => {
    const cell = new Container();
    cell.position.set(((i % 2) - 0.5) * (CELL_W + 20), Math.floor(i / 2) * 200);
    const name = fit(label(t(`run.switch.${s}`), 48, COLORS.dim), CELL_W, 60);
    name.y = -100;
    const on = sw.on(s);
    cell.addChild(name, toggle(on, CELL_W, (v) => {
      sw.set(s, v);
      redraw();
    }));
    grid.addChild(cell);
  });
  return grid;
}

export function pausePanel(w: number, h: number, st: PausePanelState, sw: PauseSwitches | null, a: PausePanelActions, redraw: () => void): Container {
  const view = new Container();
  view.addChild(backdrop(w, h));
  const box = new Container();
  box.position.set(w / 2, h / 2);
  // stacked top down: [view, height it takes]
  const items: [Container, number][] = [[label(t('run.paused'), 72), 150]];
  const resume = button(t('run.resume'), 560, 150, () => a.resume());
  if (st.keys) keyCap(resume, 560, 150, t('common.keyEsc'));
  items.push([resume, 190]);
  if (sw) {
    const grid = switchGrid(sw, redraw);
    const rows = Math.ceil(sw.list.length / 2);
    // a cell spans its name's top (-130) to the switch's bottom (+48)
    const span = (rows - 1) * 200 + 178;
    grid.y = 130 - span / 2;
    const holder = new Container();
    holder.addChild(grid);
    items.push([holder, span + 40]);
  }
  const lang = button(`${t('run.language')} · ${localeName(getLocale())}`, 560, 120, () => a.languages(), { fill: COLORS.panelLocked, size: 48 });
  items.push([spot('language', lang), 150]);
  if (st.report) {
    const report = button(st.report.text, 560, 120, () => a.report(), { fill: COLORS.panelLocked, size: 48 });
    if (st.report.busy) report.eventMode = 'none';
    items.push([report, 150]);
    const note = st.report.note;
    if (note) items.push([label(note.text, 48, note.ok ? COLORS.jade : COLORS.dim, { wordWrap: true, wordWrapWidth: 640, breakWords: true }), 110]);
  }
  const giveUp = spot('giveUp', st.confirming
    ? button(t('run.giveUpConfirm'), 560, 120, () => a.giveUp(), { fill: COLORS.danger, size: 48 })
    : button(t('run.giveUp'), 560, 120, () => a.giveUp(), { fill: COLORS.panelLocked }));
  items.push([giveUp, 150]);
  const boxH = items.reduce((sum, [, step]) => sum + step, 0) + 80;
  box.addChild(panel(W, boxH));
  let y = -boxH / 2 + 40;
  for (const [item, step] of items) {
    item.y = y + step / 2;
    box.addChild(item);
    y += step;
  }
  box.scale.set(Math.min(1, (h - 40) / boxH));
  view.addChild(box);
  return view;
}
