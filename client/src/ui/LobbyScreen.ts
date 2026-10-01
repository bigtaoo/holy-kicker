import { Container, Graphics, type Text } from 'pixi.js';
import { LOCALES, formatAmount, getLocale, localeName, t, type Locale } from '../i18n';
import { BALANCE } from '../meta/balance';
import { playableChapters, TABS, tabLock, type Lock, type Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, backdrop, button, fit, label, panel } from './widgets';

// The lobby (docs/design.md "Lobby layout"): top bar, the chapter card with its progress
// chests, PLAY, and five bottom tabs. Only Play has content so far; the other tabs show their
// unlock condition or a placeholder.

export interface LobbyActions {
  play(chapter: number): void;
  /** Shows another chapter on the card (cleared ones and the first uncleared one). */
  selectChapter(chapter: number): void;
  setLanguage(locale: Locale): void;
}

const TOP_H = 150;
const TAB_H = 190;

function lockText(lock: Lock): string {
  if (lock.kind === 'firstRun') return t('tab.unlockFirstRun');
  if (lock.kind === 'level') return t('tab.unlockLevel', { level: lock.level });
  return t('tab.unlockChapter', { n: lock.n });
}

export class LobbyScreen implements Screen {
  readonly view = new Container();
  private tab: Tab = 'play';
  private settingsOpen = false;
  private frame: UiFrame | null = null;
  private toast: Text | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly save: SaveData,
    private readonly userName: string | null,
    private readonly actions: LobbyActions,
  ) {}

  layout(f: UiFrame): void {
    this.frame = f;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.view.addChild(new Graphics().rect(0, 0, f.w, f.h).fill(COLORS.bg));
    this.topBar(f.w);
    const midY = TOP_H + (f.h - TOP_H - TAB_H) / 2;
    if (this.tab === 'play') this.playTab(f.w, midY, f.h);
    else this.placeholderTab(f.w, midY);
    this.tabBar(f.w, f.h);
    if (this.settingsOpen) this.settings(f.w, f.h);
  }

  destroy(): void {
    clearTimeout(this.toastTimer);
    this.view.destroy({ children: true });
  }

  private relayout(): void {
    if (this.frame) this.layout(this.frame);
  }

  private topBar(w: number): void {
    const bar = new Graphics().rect(0, 0, w, TOP_H).fill(COLORS.panel);
    const avatar = new Graphics().circle(90, TOP_H / 2, 50).fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 6 });
    const name = fit(label(this.userName ?? t('lobby.guest'), 44, COLORS.text, { align: 'left' }), 300);
    name.anchor.set(0, 0.5);
    name.position.set(160, TOP_H / 2 - 24);
    const level = label(t('lobby.level', { level: this.save.level }), 40, COLORS.dim);
    level.anchor.set(0, 0.5);
    level.position.set(160, TOP_H / 2 + 26);
    this.view.addChild(bar, avatar, name, level);

    const gear = button('⚙', 100, 100, () => {
      this.settingsOpen = true;
      this.relayout();
    }, { fill: COLORS.panelLocked, size: 56 });
    gear.position.set(w - 80, TOP_H / 2);
    this.view.addChild(gear);
    // currencies right-aligned, left of the settings button
    let x = w - 160;
    for (const [amount, color] of [[this.save.jade, COLORS.jade], [this.save.copper, COLORS.copper]] as const) {
      const text = label(formatAmount(amount), 48);
      text.anchor.set(1, 0.5);
      text.position.set(x, TOP_H / 2);
      const coin = new Graphics().circle(x - text.width - 36, TOP_H / 2, 24).fill(color).stroke({ color: COLORS.outline, width: 5 });
      this.view.addChild(coin, text);
      x -= text.width + 110;
    }
  }

  private playTab(w: number, midY: number, h: number): void {
    const n = this.save.chapter;
    const open = n <= playableChapters(this.save);
    const card = new Container();
    card.position.set(w / 2, midY - 130);
    card.addChild(panel(900, 470));
    const title = fit(label(t('lobby.chapterTitle', { n, name: t(`chapter.${n}` as never) }), 64), 640);
    title.y = -160;
    const best = this.save.best[n - 1];
    const status = label(
      !open ? t('lobby.unlockAtChapter', { n: n - 1 })
        : this.save.cleared >= n ? t('lobby.cleared')
        : best > 0 ? t('lobby.best', { wave: best }) : t('lobby.notPlayed'),
      48, open ? COLORS.dim : COLORS.danger,
    );
    status.y = -70;
    const chests = this.chests(n);
    chests.y = -20;
    card.addChild(title, status, chests);

    // chapter arrows: through the cleared chapters and the first uncleared one
    const arrow = (dir: -1 | 1) => {
      const target = n + dir;
      if (target < 1 || target > playableChapters(this.save)) return;
      const b = button(dir < 0 ? '‹' : '›', 90, 110, () => this.actions.selectChapter(target), { fill: COLORS.panelLocked, size: 80 });
      b.position.set(dir * 385, -160);
      card.addChild(b);
    };
    arrow(-1);
    arrow(1);
    this.view.addChild(card);

    if (open) {
      const play = button(t('lobby.play'), 620, 190, () => this.actions.play(n), { size: 88 });
      play.position.set(w / 2, Math.min(midY + 260, h - TAB_H - 140));
      this.view.addChild(play);
    }
  }

  /** The five progress chests of a chapter: gold once claimed, outlined until then. */
  private chests(chapter: number): Container {
    const row = new Container();
    const claimed = this.save.chests[chapter - 1];
    BALANCE.chests.forEach((c, i) => {
      const x = (i - 2) * 160;
      const got = (claimed & (1 << i)) !== 0;
      const box = new Graphics().roundRect(x - 55, 20, 110, 100, 18)
        .fill(got ? COLORS.saffron : COLORS.panelLocked).stroke({ color: COLORS.outline, width: 6 });
      const wave = label(String(c.wave), 48, got ? COLORS.outline : COLORS.dim);
      wave.position.set(x, 70);
      row.addChild(box, wave);
    });
    return row;
  }

  private placeholderTab(w: number, midY: number): void {
    const card = new Container();
    card.position.set(w / 2, midY);
    const name = label(t(`tab.${this.tab}` as never), 72);
    name.y = -40;
    const soon = label(t('common.comingSoon'), 48, COLORS.dim);
    soon.y = 110;
    card.addChild(panel(860, 520), name, soon);
    this.view.addChild(card);
  }

  private tabBar(w: number, h: number): void {
    const tw = w / TABS.length;
    this.view.addChild(new Graphics().rect(0, h - TAB_H, w, TAB_H).fill(COLORS.panel));
    TABS.forEach((tab, i) => {
      const lock = tabLock(this.save, tab);
      const active = tab === this.tab;
      const c = new Container();
      c.position.set(tw * (i + 0.5), h - TAB_H / 2);
      const bg = new Graphics().roundRect(-tw / 2 + 8, -TAB_H / 2 + 12, tw - 16, TAB_H - 24, 24)
        .fill(active ? COLORS.saffron : lock ? COLORS.panelLocked : COLORS.panel);
      const name = fit(label(t(`tab.${tab}` as never), 48, active ? COLORS.outline : lock ? COLORS.dim : COLORS.text), tw - 30);
      c.addChild(bg, name);
      if (lock) {
        const l = label('🔒', 36);
        l.y = -55;
        c.addChild(l);
      }
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        if (lock) return this.showToast(lockText(lock));
        this.tab = tab;
        this.relayout();
      });
      this.view.addChild(c);
    });
  }

  private settings(w: number, h: number): void {
    const close = () => {
      this.settingsOpen = false;
      this.relayout();
    };
    this.view.addChild(backdrop(w, h));
    const box = new Container();
    box.position.set(w / 2, h / 2);
    const boxH = 290 + LOCALES.length * 150 + 150;
    const top = -boxH / 2;
    box.addChild(panel(800, boxH));
    const title = label(t('settings.title'), 64);
    title.y = top + 80;
    const lang = label(t('settings.language'), 48, COLORS.dim);
    lang.y = top + 180;
    box.addChild(title, lang);
    LOCALES.forEach((locale, i) => {
      const current = locale === getLocale();
      const b = button(localeName(locale), 560, 120, () => this.actions.setLanguage(locale), {
        fill: current ? COLORS.saffron : COLORS.panelLocked,
        textFill: current ? COLORS.outline : COLORS.text,
      });
      b.y = top + 290 + i * 150;
      box.addChild(b);
    });
    const back = button(t('common.back'), 400, 110, close, { fill: COLORS.panelLocked });
    back.y = top + 290 + LOCALES.length * 150 + 20;
    box.addChild(back);
    this.view.addChild(box);
  }

  private showToast(text: string): void {
    if (!this.frame) return;
    this.toast?.destroy();
    const f = this.frame;
    const toast = fit(label(text, 48, COLORS.text, { stroke: { color: COLORS.outline, width: 8 } }), f.w - 80);
    toast.position.set(f.w / 2, f.h - TAB_H - 60);
    this.view.addChild(toast);
    this.toast = toast;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (!toast.destroyed) toast.destroy();
    }, 1800);
  }
}
