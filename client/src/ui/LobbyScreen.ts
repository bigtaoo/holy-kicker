import { Container, Graphics, type Renderer, type Text, type Texture } from 'pixi.js';
import type { RelicId } from '@hk/engine';
import { rollDice } from '@hk/protocol';
import { t } from '../i18n';
import { earnedSutras, hardOpen, playableChapters, track, type Lock, type Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import type { Store } from '../platform/types';
import { EVOLVE_IDS, type EvolveId } from '../meta/codex';
import { merge, mergeAll, type GearSlot, type ItemId, type Tier } from '../meta/gear';
import { gritBonus } from '../meta/loadout';
import { buyMonk, chooseMonk, monkPrice } from '../meta/monks';
import { train } from '../meta/training';
import type { IconSheet } from './buildBar';
import { chestRow } from './chestRow';
import { codexHeight, codexTab } from './codexTab';
import { EconomyUi, shopHeight, type LobbyTrack } from './lobbyEconomy';
import type { PatrolLook } from './economyPanels';
import { gearDetail, gearHeight, gearTab, type GearActions } from './gearTab';
import { MergeView } from './MergeView';
import { hintArrow, scenery, TAB_H, TOP_H, tabBar, topBar } from './lobbyBars';
import { hintTab } from './lobbyHint';
import { LobbyDrift, LobbyFigure } from './lobbyStage';
import { RELIC_ROW_H, relicRow, trackSwitch } from './playCard';
import { monkPanel } from './monkPanel';
import type { PlayerName } from './playerName';
import { settingsPanel, type SettingsActions } from './settingsPanel';
import { trainHeight, trainTab } from './trainTab';
import type { Screen, UiFrame } from './uiLayout';
import { BoardUi, type FetchBoard } from './boardPanel';
import { ChallengeUi, TILE_W, type ChallengeLobby } from './challengePanel';
import { consentCard, watched } from './privacyUi';
import { COLORS, button, fit, label, panel } from './widgets';

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
  /** The daily challenge for the tile beside PLAY; null while there is none to show (challengeFlow.ts). */
  challenge: () => ChallengeLobby | null;
  /** The ad-free card's purchase, for the Shop tab; null on every host but iOS. */
  store: Store | null;

  track: LobbyTrack;
}

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
  private readonly challenge: ChallengeUi;
  /** Whether rewarded ads can be offered, for the shop tab's height. */
  private adOk = false;
  private hint: Container | null = null;
  /** The monk in the courtyard (Play tab) and the specks drifting over it. */
  private figure: LobbyFigure | null = null;
  private drift: LobbyDrift | null = null;
  private figureRig: unknown = null;
  private clock = 0;

  constructor(
    private save: SaveData,
    /** The player's name (ui/playerName.ts). */
    private readonly names: PlayerName,
    private readonly actions: LobbyActions,
    private readonly icons: IconSheet,
    private readonly renderer: Renderer,
    /** Null if it failed to load: the plain background shows. */
    private readonly backdrop: Texture | null,
    /** What the patrol panel's scene is drawn with (the chosen monk's rig). */
    private readonly patrolLook: () => PatrolLook,
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
      patrolLook,
      store: actions.store,
      track: actions.track,
    }, ads);
    this.boards = new BoardUi(actions.board, () => this.relayout(), icons);
    this.challenge = new ChallengeUi(actions.challenge, this.boards, icons, () => this.relayout());
  }

  layout(f: UiFrame): void {
    this.frame = f;
    // the merge effect lives across relayouts
    if (this.merging) this.view.removeChild(this.merging.view);
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    this.econ.reset();
    this.view.addChild(new Graphics().rect(0, -f.h, f.w, 3 * f.h).fill(COLORS.bg), scenery(f, this.backdrop));
    this.figure = null;
    this.drift = new LobbyDrift(f.w, f.h - TOP_H - TAB_H);
    this.drift.view.y = TOP_H;
    this.view.addChild(this.drift.view);
    // a portal account names the player and a guest on its host has none; everyone else gets a
    // die to roll a new name with
    const reroll = !this.names.rolls() ? null : () => {
      this.change({ ...this.save, dice: rollDice(Math.random) });
      this.relayout();
    };
    this.view.addChild(topBar(f.w, this.save, this.names.shown(this.save), this.icons, {
      reroll,
      monks: () => {
        this.monksOpen = true;
        this.relayout();
      },
      settings: () => {
        this.settingsOpen = true;
        this.relayout();
      },
    }));
    const midY = TOP_H + (f.h - TOP_H - TAB_H) / 2;
    if (this.tab === 'play') this.playTab(f.w, midY, f.h);
    else if (this.tab === 'codex') this.codexTab(f.w, midY);
    else if (this.tab === 'gear') this.gearTab(f.w, midY);
    else if (this.tab === 'train') this.trainTab(f.w, midY);
    else this.shopTab(f.w, midY);
    this.view.addChild(tabBar(f.w, f.h, this.save, this.tab, this.icons, {
      locked: (lock) => this.showToast(lockText(lock)),
      select: (tab, save) => {
        if (save !== this.save) this.change(save);
        this.tab = tab;
        this.gearOpen = null;
        this.relayout();
      },
    }));
    // a new player's next step before chapter 1 is cleared: an arrow bobbing over its tab (lobbyHint.ts)
    const hint = hintTab(this.save, Date.now(), this.tab);
    this.hint = hint ? hintArrow(f.w, f.h, hint) : null;
    if (this.hint) this.view.addChild(this.hint);
    // the consent card waits at the foot of the lobby, under every panel, until it is answered
    const privacy = watched(this.actions.settings.privacy, () => this.relayout());
    if (privacy?.asking()) this.view.addChild(consentCard(f.w, f.h - TAB_H - 200, privacy));
    if (this.tab === 'gear' && this.gearOpen) this.view.addChild(gearDetail(this.save, this.gearOpen, this.icons, f.w, f.h, this.gearActions()));
    const overlay = this.econ.overlay(f.w, f.h);
    if (overlay) this.view.addChild(overlay);
    const daily = this.tab === 'play' ? this.challenge.overlay(f.w, f.h) : null;
    if (daily) this.view.addChild(daily);
    const board = this.boards.overlay(f.w, f.h);
    if (board) this.view.addChild(board);
    if (this.settingsOpen) {
      const set = this.actions.settings;
      this.view.addChild(settingsPanel(f.w, f.h, {
        ...set,
        privacy,
        // the toast stands below the panel, where the tab bar is
        copyId: set.copyId && ((id) => set.copyId!(id).then((ok) => {
          this.showToast(t(ok ? 'settings.idCopied' : 'settings.idCopyFailed'));
          return ok;
        })),
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
        setShake: (on) => {
          set.setShake(on);
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
    this.clock += dt;
    if (this.hint && !this.hint.destroyed) this.hint.pivot.y = -Math.abs(Math.sin(this.clock * 4)) * 24;
    if (this.view.destroyed) return;
    this.drift?.update(dt);
    this.figure?.update(dt);
    // the chosen monk's rig loads after the first lobby is up: he steps in once it is there
    if (this.figure && this.patrolLook().rig !== this.figureRig) this.relayout();
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
    const tab = trainTab(this.save, this.icons, this.trainPick, {
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

  private playTab(w: number, midY: number, h: number): void {
    const n = this.save.chapter;
    const open = n <= playableChapters(this.save);
    // a welcome gift takes a row under Patrol and Tasks; on a short screen the stack moves up for it
    const gift = this.econ.giftRow();
    const playY = Math.min(midY + 300, h - TAB_H - 140 - (gift ? 130 : 0));
    const hard = hardOpen(this.save);
    if (hard) {
      const sw = trackSwitch(this.save, (on) => this.actions.chooseTrack(on));
      sw.position.set(w / 2, TOP_H + 75);
      this.view.addChild(sw);
    }
    const card = this.chapterCard(n, open);
    const cardTop = TOP_H + 30 + (hard ? 110 : 0);
    card.position.set(w / 2, cardTop);
    this.view.addChild(card);

    // the monk stands on the courtyard between the card and the relic row at his feet
    const relicTop = playY - 115 - RELIC_ROW_H;
    const feet = relicTop - 10;
    const look = this.patrolLook();
    this.figureRig = look.rig;
    this.figure = new LobbyFigure(look.rig, Math.max(160, Math.min(360, feet - cardTop - card.height - 30)));
    this.figure.view.position.set(w / 2, feet);
    const relics = relicRow(this.save, this.icons, (id) => this.actions.selectRelic(id), (text) => this.showToast(text));
    relics.position.set(w / 2, relicTop);
    this.view.addChild(this.figure.view, relics);

    // the daily challenge's tile beside PLAY, at the card's right edge, PLAY narrower for it
    const tile = open ? this.challenge.tile(190) : null;
    if (tile) {
      tile.position.set(w / 2 + 450 - TILE_W / 2, playY);
      this.view.addChild(tile);
    }
    if (open) {
      const pw = tile ? 900 - TILE_W - 20 : 620;
      const play = button(t('lobby.play'), pw, 190, () => this.actions.play(n), { size: 88 });
      play.position.set(tile ? w / 2 - 450 + pw / 2 : w / 2, playY);
      this.view.addChild(play);
    }
    const row = this.econ.playRow();
    row.position.set(w / 2, playY + 200);
    this.view.addChild(row);
    if (gift) {
      gift.position.set(w / 2, playY + 335);
      this.view.addChild(gift);
    }
  }

  /** The chapter card, top at 0: its name between the chapter arrows, how far it went, its five chests. */
  private chapterCard(n: number, open: boolean): Container {
    const card = new Container();
    // grit on the first uncleared chapter takes a line: the chests move down and the card grows
    const grit = gritBonus(this.save, n);
    const gritLine = open && Object.keys(grit).length > 0
      ? fit(label(t('lobby.grit', { n: this.save.grit, attack: grit.attack ?? 0, hp: grit.maxHp ?? 0 }), 48, COLORS.saffron), 840)
      : null;
    const shift = gritLine ? 55 : 0;
    const back = panel(900, 370 + shift);
    back.y = (370 + shift) / 2;
    card.addChild(back);
    const hard = this.save.hard;
    const progress = track(this.save, hard);
    const name = t(`chapter.${n}` as never);
    const title = fit(label(hard ? t('lobby.hardTitle', { n, name }) : t('lobby.chapterTitle', { n, name }), 64, hard ? COLORS.danger : COLORS.text), 640);
    title.y = 70;
    // the save keeps waves cleared (the chests count those); the lobby names the wave the best run
    // reached, as the leaderboard and the run's HUD do
    const best = progress.best[n - 1];
    const status = label(
      !open ? t('lobby.unlockAtChapter', { n: n - 1 })
        : progress.cleared >= n ? t('lobby.cleared')
        : best > 0 ? t('lobby.best', { wave: best + 1 }) : t('lobby.notPlayed'),
      48, open ? COLORS.dim : COLORS.danger,
    );
    status.y = 155;
    const ranks = open ? this.boards.button(n, hard) : null;
    if (ranks) {
      // under the › arrow, with a gap: it is a smaller button than the arrow (boardPanel.ts)
      ranks.position.set(340, 160);
      card.addChild(ranks);
    }
    const chests = chestRow(this.save, n, this.icons, (i) => this.econ.progressChest(n, this.save.hard, i));
    chests.y = 200 + shift;
    card.addChild(title, status, chests);
    if (gritLine) {
      gritLine.y = 215;
      card.addChild(gritLine);
    }
    // chapter arrows: through the cleared chapters and the first uncleared one
    const arrow = (dir: -1 | 1) => {
      const target = n + dir;
      if (target < 1 || target > playableChapters(this.save)) return;
      const b = button(dir < 0 ? '‹' : '›', 90, 100, () => this.actions.selectChapter(target), { fill: COLORS.panelLocked, size: 80 });
      b.position.set(dir * 385, 70);
      card.addChild(b);
    };
    arrow(-1);
    arrow(1);
    return card;
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
    tab.position.set(w / 2, midY - shopHeight(this.adOk, !!this.actions.store) / 2);
    this.view.addChild(tab);
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
