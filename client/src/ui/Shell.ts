import { Container, type Application } from 'pixi.js';
import { isBossWave, isEliteWave, xpToNext, type Card } from '@hk/engine';
import { setLocale, t, type Locale } from '../i18n';
import { Game, STICK_RADIUS, type Art } from '../game/Game';
import { DragStick } from '../game/dragStick';
import type { LevelSettings } from '../game/quality';
import type { SceneOptions } from '../game/scene';
import { computeViewport } from '../game/viewport';
import { BALANCE } from '../meta/balance';
import { doubleCopper, settleRun, type Reward } from '../meta/progress';
import type { SaveData } from '../meta/save';
import type { SaveStore } from '../meta/saveStore';
import { loadSettings, saveSettings } from '../meta/settings';
import type { Platform } from '../platform/types';
import { cardText } from './cardText';
import { LobbyScreen } from './LobbyScreen';
import { ResultsScreen } from './ResultsScreen';
import { RunHud } from './RunHud';
import { buildSlots } from './buildSlots';
import { uiFrame, type Screen } from './uiLayout';

// The game's flow (docs/design.md "Flow"): the first launch goes straight into chapter 1,
// afterwards lobby -> run -> results -> lobby. Owns the save, the current screen and the
// current run, and tells the portal when gameplay starts and stops.
//
// The engine runs the chapter's waves; the shell watches its state for a new wave (a
// banner), experience and level-up offers (the card panel), the hero going down (the death
// panel, revive with an ad) and the outcome. A run ends won, lost, or when the player gives up.

export class Shell {
  private save: SaveData;
  private readonly stick = new DragStick(STICK_RADIUS);
  /** Screens draw over the run. */
  private readonly ui = new Container();
  private screen: Screen | null = null;
  private game: Game | null = null;
  private hud: RunHud | null = null;
  private chapter = 1;
  private screenKey = '';
  private quality: LevelSettings | null = null;
  /** The wave the HUD last showed, and whether the death panel is up. */
  private shownWave = -1;
  private downShown = false;
  /** The offer whose cards the HUD shows; null when none are up. */
  private shownOffer: readonly Card[] | null = null;

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    private readonly art: Art,
    private readonly scene: SceneOptions,
    private readonly store: SaveStore,
  ) {
    this.save = store.load();
    platform.bindStick(app, this.stick);
    app.stage.addChild(this.ui);
    app.ticker.add(() => this.tick());
  }

  /** `direct` skips the lobby, for stress tests and screenshots (?direct). */
  start(direct = false): void {
    if (direct || !this.save.firstRunDone) this.startRun(this.save.chapter);
    else this.showLobby();
    this.platform.portal.loaded();
  }

  /** The current run, for dev console hooks. */
  get run(): Game | null {
    return this.game;
  }

  applyQuality(s: LevelSettings): void {
    this.quality = s;
    this.game?.applyQuality(s);
  }

  /** Re-reads the save after the portal account changed (a guest signed in). */
  reloadSave(): void {
    this.save = this.store.load();
    if (this.screen instanceof LobbyScreen) this.showLobby();
  }

  private setScreen(screen: Screen | null): void {
    this.screen?.destroy();
    this.screen = screen;
    if (screen) {
      this.ui.addChild(screen.view);
      this.screenKey = '';
    }
  }

  private commit(save: SaveData): void {
    this.save = save;
    this.store.save(save);
  }

  private showLobby(): void {
    this.setScreen(new LobbyScreen(this.save, this.platform.portal.userName(), {
      play: (chapter) => this.startRun(chapter),
      selectChapter: (chapter) => {
        this.commit({ ...this.save, chapter });
        this.showLobby();
      },
      setLanguage: (locale) => this.setLanguage(locale),
    }));
  }

  private setLanguage(locale: Locale): void {
    setLocale(locale);
    saveSettings(this.platform.storage, { ...loadSettings(this.platform.storage), locale });
    this.showLobby();
  }

  private startRun(chapter: number): void {
    this.chapter = chapter;
    this.setScreen(null);
    this.game = new Game(this.app, this.platform, this.art, this.scene, this.stick, {
      waves: this.scene.waves ? BALANCE.waves : 0,
      revives: BALANCE.revives,
    });
    this.shownWave = -1;
    this.downShown = false;
    this.shownOffer = null;
    if (this.quality) this.game.applyQuality(this.quality);
    // the run adds itself to the stage; keep the UI above it
    this.app.stage.addChild(this.ui);
    this.hud = new RunHud(BALANCE.waves, {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      giveUp: () => this.endRun(),
      revive: () => this.revive(),
      pick: (index) => this.game?.pick(index),
    }, this.art.icons);
    this.setScreen(this.hud);
    this.platform.portal.gameplayStart();
  }

  private setPaused(paused: boolean): void {
    if (!this.game) return;
    this.game.paused = paused;
    if (paused) this.platform.portal.gameplayStop();
    else this.platform.portal.gameplayStart();
  }

  private async revive(): Promise<boolean> {
    const paid = await this.platform.ads.rewarded();
    if (!paid || !this.game) return false;
    // the engine stands the hero up on its next tick; watchRun then resumes the portal
    this.game.revive();
    return true;
  }

  /** Waves fully cleared: all of them for a won run, else the ones before the current wave. */
  private wavesCleared(): number {
    if (!this.game) return 0;
    const s = this.game.engine.state;
    return s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
  }

  private endRun(): void {
    if (!this.game) return;
    const waves = this.wavesCleared();
    const offerings = this.game.engine.state.players[0].offerings;
    this.game.destroy();
    this.game = null;
    this.hud = null;
    // the death panel already told the portal
    if (!this.downShown) this.platform.portal.gameplayStop();
    const { save, reward } = settleRun(this.save, { chapter: this.chapter, waves, offerings });
    // paid before the results show, so closing the tab now keeps the reward
    this.commit(save);
    if (reward.firstClear) this.platform.portal.celebrate();
    this.showResults(reward, waves);
  }

  private showResults(reward: Reward, waves: number): void {
    let leaving = false;
    this.setScreen(new ResultsScreen(reward, waves, {
      double: async () => {
        const paid = await this.platform.ads.rewarded();
        if (paid) this.commit(doubleCopper(this.save, reward));
        return paid;
      },
      next: () => {
        if (leaving) return;
        leaving = true;
        // the interstitial sits on the results -> lobby break, never inside a run
        void this.platform.ads.midgame().then(() => this.showLobby());
      },
    }, this.platform.ads.rewardedAvailable()));
  }

  private tick(): void {
    const { width, height } = this.app.screen;
    const key = `${width}x${height}`;
    if (this.screen && key !== this.screenKey) {
      this.screenKey = key;
      this.screen.layout(uiFrame(computeViewport(width, height)));
    }
    if (this.game && this.hud) this.watchRun(this.game, this.hud);
  }

  private watchRun(game: Game, hud: RunHud): void {
    const s = game.engine.state;
    hud.update(this.app.ticker.deltaMS / 1000);
    if (s.wave !== this.shownWave) {
      this.shownWave = s.wave;
      hud.setWave(s.wave);
      const last = s.config.waves;
      const warning = isBossWave(s.wave, last) ? t('run.boss') : isEliteWave(s.wave, last) ? t('run.elite') : null;
      if (s.wave > 0) hud.announce(s.wave, warning);
    }
    const p = s.players[0];
    hud.setXp(p.level, p.xp / xpToNext(p.level));
    hud.setBuild(buildSlots(p));
    // offers come one after another (several levels at once, a shrine's insight), each a new list
    if (p.offer.length > 0 && this.shownOffer !== p.offer) {
      this.shownOffer = p.offer;
      const title = p.offer[0].kind === 'shrine' ? t('card.shrine') : t('card.levelUp');
      hud.showOffer(title, p.offer.map((c) => cardText(c, p)));
    } else if (p.offer.length === 0 && this.shownOffer) {
      this.shownOffer = null;
      hud.hideOffer();
    }
    if (s.outcome === 'playing' && this.downShown) {
      this.downShown = false;
      this.platform.portal.gameplayStart();
    }
    if (s.outcome === 'won') this.endRun();
    else if (s.outcome === 'lost' && !this.downShown) {
      this.downShown = true;
      this.platform.portal.gameplayStop();
      // the offer appears once the host says an ad can play
      hud.showDown(false);
      if (s.players[0].revives > 0) {
        void this.platform.ads.rewardedAvailable().then((ok) => {
          if (ok && this.hud === hud && this.downShown) hud.showDown(true);
        });
      }
    }
  }
}
