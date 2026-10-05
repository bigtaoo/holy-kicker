import { Container, Graphics, type Renderer, type Text } from 'pixi.js';
import { RELIC_IDS, type RelicId } from '@hk/engine';
import { formatAmount, t } from '../i18n';
import { BALANCE } from '../meta/balance';
import { earnedSutras, hardOpen, playableChapters, seeTab, TABS, tabLock, tabNew, track, unlockedRelics, type Lock, type Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import { EVOLVE_IDS, type EvolveId } from '../meta/codex';
import { merge, mergeAll, type GearSlot, type ItemId, type Tier } from '../meta/gear';
import { gritBonus } from '../meta/loadout';
import { buyMonk, chooseMonk, monkAffordable, monkPrice } from '../meta/monks';
import { train } from '../meta/training';
import { iconSprite, type IconSheet } from './buildBar';
import { codexHeight, codexTab } from './codexTab';
import { EconomyUi, shopHeight, shopWaiting, type LobbyTrack } from './lobbyEconomy';
import { gearDetail, gearHeight, gearTab, type GearActions } from './gearTab';
import { MergeView } from './MergeView';
import { monkPanel } from './monkPanel';
import { settingsPanel, type SettingsActions } from './settingsPanel';
import { trainHeight, trainTab } from './trainTab';
import type { Screen, UiFrame } from './uiLayout';
import { BoardUi, type FetchBoard } from './boardPanel';
import { COLORS, button, dot, fit, label, panel } from './widgets';

// The lobby (docs/design.md "Lobby layout"): top bar, the chapter card with its progress
// chests and the relic to play with, PLAY with the patrol and daily tasks under it, and five
// bottom tabs. Gear merges, training and the economy (lobbyEconomy.ts: shop, patrol, tasks)
// are pure save changes made here and handed to the shell to store.

export interface LobbyActions {
  play(chapter: number): void;
  /** Shows another chapter on the card (cleared ones and the first uncleared one). */
  selectChapter(chapter: number): void;
  /** Switches the card between the normal chapters and hard mode (open once all are cleared). */
  chooseTrack(hard: boolean): void;
  selectRelic(relic: RelicId): void;
  /** The settings panel's reads and changes (settingsPanel.ts), all but closing it. */
  settings: Omit<SettingsActions, 'close'>;
  /** Stores a save the lobby changed (a merge, a training node). */
  commit(save: SaveData): void;
  /** Whether a rewarded ad can be offered, and playing one (shop chests, patrol). */
  adAvailable(): Promise<boolean>;
  rewarded(): Promise<boolean>;
  /** Fetches a leaderboard; null offline (no Ranks button then). */
  board: FetchBoard | null;
  track: LobbyTrack;
}

const TOP_H = 150;
const TAB_H = 190;
/** How far the bars reach past the frame, over the safe-area bands (more than any inset). */
const BLEED = 800;
const RELIC_R = 60;

function lockText(lock: Lock): string {
  if (lock.kind === 'firstRun') return t('tab.unlockFirstRun');
  if (lock.kind === 'level') return t('tab.unlockLevel', { level: lock.level });
  return t('tab.unlockChapter', { n: lock.n });
}

export class LobbyScreen implements Screen {
  readonly view = new Container();
  private tab: Tab = 'play';
  private settingsOpen = false;
  private monksOpen = false;
  /** The Codex entry shown in detail. */
  private codexPick: EvolveId | null = null;
  /** The gear slot open in detail, the training node shown, the merge effect playing. */
  private gearOpen: GearSlot | null = null;
  private trainPick: number | null = null;
  private merging: MergeView | null = null;
  private frame: UiFrame | null = null;
  private toast: Text | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly econ: EconomyUi;
  private readonly boards: BoardUi;
  /** Whether rewarded ads can be offered, for the shop tab's height. */
  private adOk = false;

  constructor(
    private save: SaveData,
    private readonly userName: string | null,
    private readonly actions: LobbyActions,
    private readonly icons: IconSheet,
    private readonly renderer: Renderer,
  ) {
    const ads = actions.adAvailable();
    void ads.then((ok) => (this.adOk = ok));
    this.econ = new EconomyUi({
      save: () => this.save,
      change: (s) => {
        this.change(s);
        this.relayout();
      },
      relayout: () => this.relayout(),
      toast: (text) => this.showToast(text),
      rewarded: () => actions.rewarded(),
      icons: this.icons,
      track: actions.track,
    }, ads);
    this.boards = new BoardUi(actions.board, () => this.relayout());
  }

  layout(f: UiFrame): void {
    this.frame = f;
    // the merge effect lives across relayouts
    if (this.merging) this.view.removeChild(this.merging.view);
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.econ.reset();
    this.view.addChild(new Graphics().rect(0, -f.h, f.w, 3 * f.h).fill(COLORS.bg));
    this.topBar(f.w);
    const midY = TOP_H + (f.h - TOP_H - TAB_H) / 2;
    if (this.tab === 'play') this.playTab(f.w, midY, f.h);
    else if (this.tab === 'codex') this.codexTab(f.w, midY);
    else if (this.tab === 'gear') this.gearTab(f.w, midY);
    else if (this.tab === 'train') this.trainTab(f.w, midY);
    else this.shopTab(f.w, midY);
    this.tabBar(f.w, f.h);
    if (this.tab === 'gear' && this.gearOpen) this.view.addChild(gearDetail(this.save, this.gearOpen, this.icons, f.w, f.h, this.gearActions()));
    const overlay = this.econ.overlay(f.w, f.h);
    if (overlay) this.view.addChild(overlay);
    const board = this.boards.overlay(f.w, f.h);
    if (board) this.view.addChild(board);
    if (this.settingsOpen) {
      const set = this.actions.settings;
      this.view.addChild(settingsPanel(f.w, f.h, {
        ...set,
        setVolume: (v) => {
          set.setVolume(v);
          this.relayout();
        },
        setMusic: (v) => {
          set.setMusic(v);
          this.relayout();
        },
        setQuality: (m) => {
          set.setQuality(m);
          this.relayout();
        },
        close: () => {
          this.settingsOpen = false;
          this.relayout();
        },
      }));
    }
    if (this.monksOpen) this.view.addChild(this.monkPanel(f));
    if (this.merging) this.view.addChild(this.merging.view);
  }

  /** The monk panel over the lobby: buying a monk plays him at once. */
  private monkPanel(f: UiFrame): Container {
    return monkPanel(f.w, f.h, this.save, this.icons, {
      choose: (id) => {
        this.change(chooseMonk(this.save, id));
        this.relayout();
      },
      buy: (id) => {
        const next = buyMonk(this.save, id);
        if (!next) return this.showToast(t('shop.noJade'));
        this.change(next);
        this.actions.track('buy', { item: 'monk', monk: id, spent: monkPrice(id) });
        this.relayout();
        this.showToast(t('monk.joined', { name: t(`monk.${id}.name`) }));
      },
      close: () => {
        this.monksOpen = false;
        this.relayout();
      },
    });
  }

  update(dt: number): void {
    this.merging?.update(dt);
    this.econ.update(dt);
  }

  destroy(): void {
    clearTimeout(this.toastTimer);
    this.merging?.destroy();
    this.view.destroy({ children: true });
  }

  private change(save: SaveData): void {
    this.save = save;
    this.actions.commit(save);
  }

  private gearActions(): GearActions {
    return {
      open: (slot) => {
        this.gearOpen = slot;
        this.relayout();
      },
      close: () => {
        this.gearOpen = null;
        this.relayout();
      },
      merge: (item: ItemId, tier: Tier) => {
        this.change(merge(this.save, item, tier));
        this.playMerge({ item, tier: (tier + 1) as Tier });
      },
      mergeAll: () => {
        const { save, done } = mergeAll(this.save);
        if (done.length === 0) return;
        this.change(save);
        const best = done.reduce((a, b) => (b.tier >= a.tier ? b : a));
        this.playMerge({ ...best, all: done });
      },
      toast: (text) => this.showToast(text),
    };
  }

  private playMerge(show: ConstructorParameters<typeof MergeView>[4]): void {
    if (!this.frame) return;
    this.merging?.destroy();
    this.merging = new MergeView(this.renderer, this.icons, this.frame.w, this.frame.h, show, () => {
      this.merging?.destroy();
      this.merging = null;
      this.relayout();
    });
    this.relayout();
  }

  private gearTab(w: number, midY: number): void {
    const tab = gearTab(this.save, this.icons, this.gearActions());
    tab.position.set(w / 2, midY - gearHeight(this.save) / 2);
    this.view.addChild(tab);
  }

  private trainTab(w: number, midY: number): void {
    const tab = trainTab(this.save, this.trainPick, {
      train: () => {
        const next = train(this.save);
        if (next !== this.save) this.actions.track('buy', { item: 'train', node: next.trained, spent: this.save.copper - next.copper });
        this.change(next);
        this.trainPick = null;
        this.relayout();
      },
      pick: (n) => {
        this.trainPick = n;
        this.relayout();
      },
      toast: (text) => this.showToast(text),
    });
    tab.position.set(w / 2, midY - trainHeight(this.save) / 2);
    this.view.addChild(tab);
  }

  /** Opens on the settings panel (the lobby is rebuilt after a language change). */
  openSettings(): void {
    this.settingsOpen = true;
  }

  private relayout(): void {
    // an ad can finish after the lobby is gone
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private topBar(w: number): void {
    // the bars run on into the safe-area bands above and below the frame
    const bar = new Graphics().rect(0, -BLEED, w, TOP_H + BLEED).fill(COLORS.panel);
    // the avatar is the monk played as; it opens the monk panel
    const avatar = new Container();
    avatar.position.set(90, TOP_H / 2);
    avatar.addChild(new Graphics().circle(0, 0, 58).fill(COLORS.saffron).stroke({ color: COLORS.outline, width: 6 }));
    // the portrait's head and shoulders, cut to the circle
    const face = iconSprite(this.icons, `monk_${this.save.monk}`, 230);
    if (face) {
      face.y = 62;
      const mask = new Graphics().circle(0, 0, 53).fill(0xffffff);
      face.mask = mask;
      avatar.addChild(face, mask);
    }
    if (monkAffordable(this.save)) avatar.addChild(dot(44, -44));
    avatar.eventMode = 'static';
    avatar.cursor = 'pointer';
    avatar.on('pointertap', () => {
      this.monksOpen = true;
      this.relayout();
    });
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
    card.position.set(w / 2, midY - 180);
    // grit on the first uncleared chapter takes a line: the rows below move down and the card grows
    const grit = gritBonus(this.save, n);
    const gritLine = open && Object.keys(grit).length > 0
      ? fit(label(t('lobby.grit', { n: this.save.grit, attack: grit.attack ?? 0, hp: grit.maxHp ?? 0 }), 48, COLORS.saffron), 840)
      : null;
    const shift = gritLine ? 50 : 0;
    const back = panel(900, 620 + shift);
    back.y = shift / 2;
    card.addChild(back);
    const hard = this.save.hard;
    const progress = track(this.save, hard);
    const name = t(`chapter.${n}` as never);
    const title = fit(label(hard ? t('lobby.hardTitle', { n, name }) : t('lobby.chapterTitle', { n, name }), 64, hard ? COLORS.danger : COLORS.text), 640);
    title.y = -235;
    const best = progress.best[n - 1];
    const status = label(
      !open ? t('lobby.unlockAtChapter', { n: n - 1 })
        : progress.cleared >= n ? t('lobby.cleared')
        : best > 0 ? t('lobby.best', { wave: best }) : t('lobby.notPlayed'),
      48, open ? COLORS.dim : COLORS.danger,
    );
    status.y = -145;
    const ranks = open ? this.boards.button(n, hard) : null;
    if (ranks) {
      ranks.position.set(340, -145);
      card.addChild(ranks);
    }
    const chests = this.chests(n);
    chests.y = -95 + shift;
    const relics = this.relics();
    relics.y = 85 + shift;
    card.addChild(title, status, chests, relics);
    if (gritLine) {
      gritLine.y = -85;
      card.addChild(gritLine);
    }

    // chapter arrows: through the cleared chapters and the first uncleared one
    const arrow = (dir: -1 | 1) => {
      const target = n + dir;
      if (target < 1 || target > playableChapters(this.save)) return;
      const b = button(dir < 0 ? '‹' : '›', 90, 110, () => this.actions.selectChapter(target), { fill: COLORS.panelLocked, size: 80 });
      b.position.set(dir * 385, -235);
      card.addChild(b);
    };
    arrow(-1);
    arrow(1);
    if (hardOpen(this.save)) card.addChild(this.trackSwitch(-400));
    this.view.addChild(card);

    if (open) {
      const play = button(t('lobby.play'), 620, 190, () => this.actions.play(n), { size: 88 });
      play.position.set(w / 2, Math.min(midY + 300, h - TAB_H - 140));
      this.view.addChild(play);
    }
    const row = this.econ.playRow();
    row.position.set(w / 2, Math.min(midY + 300, h - TAB_H - 140) + 200);
    this.view.addChild(row);
  }

  /** Normal and hard side by side above the card, the shown one lit. */
  private trackSwitch(y: number): Container {
    const row = new Container();
    ([[false, 'lobby.normal'], [true, 'lobby.hard']] as const).forEach(([hard, key], i) => {
      const on = this.save.hard === hard;
      const b = button(t(key), 300, 100, () => {
        if (!on) this.actions.chooseTrack(hard);
      }, { fill: on ? (hard ? COLORS.danger : COLORS.saffron) : COLORS.panelLocked, size: 52, textFill: on ? COLORS.text : COLORS.dim });
      b.position.set((i - 0.5) * 320, y);
      row.addChild(b);
    });
    return row;
  }

  /** The relic for the next run: its name, then one badge per relic (locked ones dimmed). */
  private relics(): Container {
    const row = new Container();
    const chosen = this.save.relic;
    const head = label(`${t('lobby.relic')}: ${t(`relic.${chosen}.name`)}`, 48);
    const open = unlockedRelics(this.save);
    row.addChild(head);
    RELIC_IDS.forEach((id, i) => {
      const unlocked = open.includes(id);
      const c = new Container();
      c.position.set((i - (RELIC_IDS.length - 1) / 2) * (RELIC_R * 2 + 40), 115);
      c.addChild(new Graphics().circle(0, 0, RELIC_R).fill(unlocked ? COLORS.panel : COLORS.panelLocked)
        .stroke({ color: id === chosen ? COLORS.saffron : COLORS.outline, width: id === chosen ? 10 : 6 }));
      const icon = iconSprite(this.icons, id, RELIC_R * 1.5);
      if (icon) {
        if (!unlocked) icon.alpha = 0.35;
        c.addChild(icon);
      }
      if (!unlocked) {
        const l = label('🔒', 40);
        l.position.set(RELIC_R * 0.6, RELIC_R * 0.6);
        c.addChild(l);
      }
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        if (!unlocked) return this.showToast(t('tab.unlockChapter', { n: RELIC_IDS.indexOf(id) }));
        if (id !== chosen) this.actions.selectRelic(id);
      });
      row.addChild(c);
    });
    return row;
  }

  /** The five progress chests of a chapter: gold once claimed, outlined until then. */
  private chests(chapter: number): Container {
    const row = new Container();
    const claimed = track(this.save, this.save.hard).chests[chapter - 1];
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

  private codexTab(w: number, midY: number): void {
    const tab = codexTab(this.save.codex, earnedSutras(this.save), this.icons, this.codexPick, (id) => {
      this.codexPick = id;
      this.relayout();
    });
    tab.position.set(w / 2, midY - codexHeight(EVOLVE_IDS.length) / 2);
    this.view.addChild(tab);
  }

  private shopTab(w: number, midY: number): void {
    const tab = this.econ.shopTab();
    tab.position.set(w / 2, midY - shopHeight(this.adOk) / 2);
    this.view.addChild(tab);
  }

  private tabBar(w: number, h: number): void {
    const tw = w / TABS.length;
    this.view.addChild(new Graphics().rect(0, h - TAB_H, w, TAB_H + BLEED).fill(COLORS.panel));
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
      } else if (tabNew(this.save, tab) || (tab === 'shop' && shopWaiting(this.save, Date.now()))) {
        c.addChild(dot(tw / 2 - 30, -TAB_H / 2 + 30));
      }
      c.eventMode = 'static';
      c.cursor = 'pointer';
      c.on('pointertap', () => {
        if (lock) return this.showToast(lockText(lock));
        if (tabNew(this.save, tab)) this.change(seeTab(this.save, tab));
        this.tab = tab;
        this.gearOpen = null;
        this.relayout();
      });
      this.view.addChild(c);
    });
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
