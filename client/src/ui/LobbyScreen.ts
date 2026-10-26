import { Container, Graphics, type Renderer, type Texture } from 'pixi.js';
import type { RelicId } from '@hk/engine';
import { rollDice, type OfferPlace } from '@hk/protocol';
import { t } from '../i18n';
import { earnedSutras, playableChapters, tabLock, type Lock, type Tab } from '../meta/progress';
import type { SaveData } from '../meta/save';
import type { Store } from '../platform/types';
import type { EvolveId } from '../meta/codex';
import { merge, mergeAll, type GearSlot, type ItemId, type Tier } from '../meta/gear';
import { buyMonk, chooseMonk, monkPrice } from '../meta/monks';
import { train } from '../meta/training';
import type { IconSheet } from './buildBar';
import { chapterCard, hasTrackSwitch, trackSwitch, type ChapterCardDeps } from './chapterCard';
import { codexTab } from './codexTab';
import { EconomyUi, type LobbyTrack } from './lobbyEconomy';
import type { PatrolLook } from './economyPanels';
import { gearDetail, gearTab, type GearActions } from './gearTab';
import { MergeView } from './MergeView';
import { hintArrow, menuBackdrop, scenery, tabBar, topBar } from './lobbyBars';
import { hintTab, nextStep } from './lobbyHint';
import { figureFeet, isWide, PLAY_H, PLAY_W, playSpots, playY, TAB_H, TOP_H } from './lobbyLayout';
import { LobbyDrift, LobbyFigure } from './lobbyStage';
import { playButton, type PlayButton } from './lobbyPlay';
import { relicRow } from './playCard';
import { monkPanel } from './monkPanel';
import type { PlayerName } from './playerName';
import { settingsPanel, type SettingsActions } from './settingsPanel';
import { trainTab } from './trainTab';
import type { Screen, UiFrame } from './uiLayout';
import { BoardUi, type FetchBoard } from './boardPanel';
import { ChallengeUi, type ChallengeLobby } from './challengePanel';
import { consentCard, watched } from './privacyUi';
import { redrawn, reminderCard } from './reminders';
import { COLORS, fit, label, oneDot, panel } from './widgets';
import { spot } from './spots';

// The lobby (docs/design.md "Lobby layout"): top bar, the chapter card with its progress
// chests, the monk on stage with the relic to play with at his feet and PLAY under them, round
// buttons down both sides (patrol, tasks, the challenge, the gift), and five bottom tabs. Gear merges, training and the economy (lobbyEconomy.ts: shop, patrol, tasks)
// are pure save changes made here and handed to the shell to store.

export interface LobbyActions {
  play(chapter: number): void;
  /** Shows another chapter on the card (cleared ones and the first uncleared one). */
  selectChapter(chapter: number): void;
  /** Switches the shown chapter between its normal and hard mode (open with its three stars). */
  chooseTrack(hard: boolean): void;
  selectRelic(relic: RelicId): void;
  /** The settings panel's reads and changes (settingsPanel.ts), all but closing it. */
  settings: Omit<SettingsActions, 'close'>;
  /** Stores a save the lobby changed (a merge, a training node). */
  commit(save: SaveData): void;
  /** Whether a rewarded ad can be offered, and playing one (shop chests, patrol). */
  adAvailable(): Promise<boolean>;
  rewarded(at: OfferPlace): Promise<boolean>;
  /** Fetches a leaderboard; null offline (no Ranks button then). */
  board: FetchBoard | null;
  /** The daily challenge for the tile beside PLAY; null while there is none to show (challengeFlow.ts). */
  challenge: () => ChallengeLobby | null;
  /** The ad-free card's purchase, for the Shop tab; null on every host but iOS. */
  store: Store | null;

  track: LobbyTrack;
}

/** The gap between the top bar and a menu tab's title. */
const MENU_TOP = 40;
/** The monk's height on the Gear tab before the Play tab has drawn him. */
const FIGURE_H = 440;
/** A Train tap this soon after a node was bought is the same thumb's second tap. */
const TRAIN_GAP_MS = 400;

function lockText(lock: Lock): string {
  if (lock.kind === 'firstRun') return t('tab.unlockFirstRun');
  if (lock.kind === 'level') return t('tab.unlockLevel', { level: lock.level });
  return t('tab.unlockChapter', { n: lock.n });
}

export class LobbyScreen implements Screen {
  readonly view = new Container();
  private tab: Tab = 'play';
  private settingsOpen = false;
  private accountOpen = false; // settings' second panel
  private monksOpen = false;
  /** The Codex entry shown in detail. */
  private codexPick: EvolveId | null = null;
  /** The gear slot open in detail, the training node shown, the merge effect playing. */
  private gearOpen: GearSlot | null = null;
  private trainPick: number | null = null;
  /** When the last node was bought: a double tap's second tap lands on the next node's button, its price unseen. */
  private trainedAt = -Infinity;
  private merging: MergeView | null = null;
  private frame: UiFrame | null = null;
  private toast: Container | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly econ: EconomyUi;
  private readonly boards: BoardUi;
  private readonly challenge: ChallengeUi;
  private hint: Container | null = null;
  /** No panel, card or first-steps arrow is up: a prompt from outside may show (ui/updatePrompt.ts). */
  idle = false;
  private menuBack: Texture | null = null;
  /** The monk in the courtyard (Play tab) and the specks drifting over it. */
  private figure: LobbyFigure | null = null;
  private play: PlayButton | null = null;
  private drift: LobbyDrift | null = null;
  private figureRig: unknown = null;
  /** How tall the Play tab last drew the monk; Gear draws him the same so he holds still between them. */
  private figureH = FIGURE_H;
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
    this.econ = new EconomyUi({
      save: () => this.save,
      change: (s) => {
        this.change(s);
        this.relayout();
      },
      relayout: () => this.relayout(),
      toast: (text) => this.showToast(text),
      rewarded: (at) => actions.rewarded(at),
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
    this.view.addChild(new Graphics().rect(0, -f.h, f.w, 3 * f.h).fill(COLORS.bg), this.scenery(f));
    this.figure = null;
    this.play = null;
    this.drift = new LobbyDrift(f.w, f.h - TOP_H - TAB_H, this.save.cleared);
    this.drift.view.y = TOP_H;
    this.view.addChild(this.drift.view);
    // a portal account names the player and a guest on its host has none; everyone else gets a
    // die to roll a new name with
    const reroll = !this.names.rolls() ? null : () => {
      this.change({ ...this.save, dice: rollDice(Math.random) });
      this.relayout();
    };
    const bar = this.view.addChild(topBar(f.w, this.save, this.names.shown(this.save), this.icons, {
      reroll,
      monks: () => {
        this.monksOpen = true;
        this.relayout();
      },
      settings: () => {
        this.settingsOpen = true;
        this.accountOpen = false;
        this.relayout();
      },
    }));
    // the menu tabs hang from a fixed line under the top bar, so switching tabs does not move the titles
    const top = TOP_H + MENU_TOP;
    if (this.tab === 'play') this.playTab(f.w, f.h);
    else if (this.tab === 'codex') this.codexTab(f.w, f.h, top);
    else if (this.tab === 'gear') this.gearTab(f.w, f.h, top);
    else if (this.tab === 'train') this.trainTab(f.w, top);
    else this.shopTab(f.w, f.h, top);
    // a new player's next step before chapter 1 is cleared: an arrow bobbing over its tab (lobbyHint.ts)
    const hint = hintTab(this.save, Date.now(), this.tab);
    const tabs = this.view.addChild(tabBar(f.w, f.h, this.save, this.tab, this.icons, {
      locked: (lock) => this.showToast(lockText(lock)),
      select: (tab, save) => {
        if (save !== this.save) this.change(save);
        this.tab = tab;
        this.gearOpen = null;
        this.relayout();
      },
    }, nextStep(this.save, Date.now())));
    // one red dot at a time: the hinted tab's, else what is on this tab, then the tab bar, then the monk
    const content = this.view.children.slice(this.view.getChildIndex(bar) + 1, this.view.getChildIndex(tabs));
    oneDot(hint ? [tabs, ...content, bar] : [...content, tabs, bar]);
    this.hint = hint ? hintArrow(f.w, f.h, hint) : null;
    if (this.hint) this.view.addChild(this.hint);
    // the consent card waits at the foot of the lobby, under every panel, until it is answered
    const privacy = watched(this.actions.settings.privacy, () => this.relayout());
    const reminders = this.actions.settings.reminders && redrawn(this.actions.settings.reminders, () => this.relayout());
    if (privacy?.asking()) this.view.addChild(consentCard(f.w, f.h - TAB_H - 200, privacy));
    else if (reminders?.offering()) this.view.addChild(reminderCard(f.w, f.h - TAB_H - 200, reminders));
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
        reminders,
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
        haptics: set.haptics && {
          on: set.haptics.on,
          set: (on) => {
            set.haptics!.set(on);
            this.relayout();
          },
        },
        accountOpen: this.accountOpen,
        openAccount: (open) => {
          this.accountOpen = open;
          this.relayout();
        },
        close: () => {
          this.settingsOpen = this.accountOpen = false;
          this.relayout();
        },
      }));
    }
    if (this.monksOpen) this.view.addChild(this.monkPanel(f));
    if (this.merging) this.view.addChild(this.merging.view);
    this.idle = !nextStep(this.save, Date.now()) && !privacy?.asking() && !reminders?.offering() && !(this.tab === 'gear' && this.gearOpen)
      && !overlay && !daily && !board && !this.settingsOpen && !this.monksOpen && !this.merging;
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
    this.play?.update(dt);
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

  /**
   * The courtyard: in daylight where the monk stands on it (Play, and Gear's paper doll), out of
   * focus and dark behind the panels of Shop, Train and Codex (baked on first use).
   */
  private scenery(f: UiFrame): Container {
    if (!this.backdrop) return scenery(f, null);
    const day = this.tab === 'play' || this.tab === 'gear';
    if (!day) this.menuBack = menuBackdrop(this.renderer, this.backdrop, isWide(f.w, f.h));
    return day ? scenery(f, this.backdrop) : scenery(f, this.menuBack, true);
  }

  private gearTab(w: number, h: number, top: number): void {
    // the chosen monk stands among his gear: the Play tab's figure, updated and swapped like it
    const look = this.patrolLook();
    this.figureRig = look.rig;
    // a landscape Play tab's monk stands taller than the gear around him leaves room for
    this.figure = new LobbyFigure(look.rig, Math.min(this.figureH, FIGURE_H));
    const stand = { hero: this.figure.view, feet: figureFeet(h) - top, button: playY(h) - top };
    const tab = gearTab(this.save, this.icons, this.gearActions(), h - TAB_H - top, stand);
    tab.position.set(w / 2, top);
    this.view.addChild(tab);
  }

  private trainTab(w: number, top: number): void {
    const tab = trainTab(this.save, this.icons, this.trainPick, {
      train: () => {
        const now = Date.now();
        if (now - this.trainedAt < TRAIN_GAP_MS) return;
        const next = train(this.save);
        if (next !== this.save) {
          this.trainedAt = now;
          this.actions.track('buy', { item: 'train', node: next.trained, spent: this.save.copper - next.copper });
        }
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
    tab.position.set(w / 2, top);
    this.view.addChild(tab);
  }

  /** Opens on the settings panel (the lobby is rebuilt after a language change). */
  openSettings(): void {
    this.settingsOpen = true;
  }

  get shownTab(): Tab { return this.tab; }

  /** Opens on `tab` (the results' next step), unless it is still locked. */
  openTab(tab: Tab): void {
    if (!tabLock(this.save, tab)) this.tab = tab;
  }

  /** Draws the lobby again where it stands: same tab, panels and toast. */
  relayout(): void {
    // an ad can finish after the lobby is gone
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }

  private playTab(w: number, h: number): void {
    const n = this.save.chapter;
    const open = n <= playableChapters(this.save);
    const deps: ChapterCardDeps = {
      save: this.save, icons: this.icons, boards: this.boards,
      selectChapter: (c) => this.actions.selectChapter(c),
      chooseTrack: (on) => this.actions.chooseTrack(on),
      progressChest: (c, hard, i) => this.econ.progressChest(c, hard, i),
      toast: (text) => this.showToast(text),
    };
    const switched = hasTrackSwitch(this.save);
    const card = chapterCard(deps, n, open);
    const at = playSpots(w, h, card.height, switched);
    if (switched) {
      const sw = trackSwitch(deps);
      sw.position.set(at.trackSwitch.x, at.trackSwitch.y);
      this.view.addChild(sw);
    }
    card.position.set(at.card.x, at.card.y);
    this.view.addChild(card);

    // PLAY, the one loud button, stands over the tab bar; the relic row and the monk above it
    const look = this.patrolLook();
    this.figureRig = look.rig;
    this.figureH = at.figureH;
    this.figure = new LobbyFigure(look.rig, this.figureH);
    this.figure.view.position.set(at.feet.x, at.feet.y);
    const relics = relicRow(this.save, this.icons, (id) => this.actions.selectRelic(id));
    relics.position.set(at.feet.x, at.feet.y + 5);
    this.view.addChild(this.figure.view, relics);
    if (open) {
      this.play = playButton(t('lobby.play'), PLAY_W, PLAY_H, () => this.actions.play(n));
      this.play.view.position.set(at.play.x, at.play.y);
      this.play.view.label = 'play'; // tests tell it from the Play tab, which reads the same in Chinese
      this.view.addChild(spot('play', this.play.view));
    }

    // the side things on two rails: Patrol and Tasks, then the challenge and the gift
    const rails = [[this.econ.patrolRail(), this.econ.tasksRail()], [open ? this.challenge.rail() : null, this.econ.giftRail()]];
    rails.forEach((items, r) => items.filter((c): c is Container => c !== null).forEach((c, i) => {
      c.position.set(at.rails[r][i].x, at.rails[r][i].y);
      this.view.addChild(c);
    }));
  }

  private codexTab(w: number, h: number, top: number): void {
    const tab = codexTab(this.save.codex, earnedSutras(this.save), this.icons, this.codexPick, (id) => {
      this.codexPick = id;
      this.relayout();
    }, h - TAB_H - top - 20);
    tab.position.set(w / 2, top);
    this.view.addChild(tab);
  }

  private shopTab(w: number, h: number, top: number): void {
    const tab = this.econ.shopTab(h - TAB_H - top - 30);
    tab.position.set(w / 2, top);
    this.view.addChild(tab);
  }

  private showToast(text: string): void {
    if (!this.frame) return;
    this.toast?.destroy();
    const f = this.frame;
    // a dark pill, so the line reads as a passing message and not as part of the tab under it
    const words = fit(label(text, 48, COLORS.text), f.w - 140);
    const toast = new Container();
    toast.addChild(panel(words.width + 80, 96, COLORS.panel, 48), words);
    toast.position.set(f.w / 2, f.h - TAB_H - 80);
    toast.eventMode = 'none';
    this.view.addChild(toast);
    this.toast = toast;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      if (!toast.destroyed) toast.destroy({ children: true });
    }, 1800);
  }
}
