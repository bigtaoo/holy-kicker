import { Container, type Application } from 'pixi.js';
import { TICK_RATE } from '@hk/engine';
import { setLocale, type Locale } from '../i18n';
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
import { LobbyScreen } from './LobbyScreen';
import { ResultsScreen } from './ResultsScreen';
import { RunHud } from './RunHud';
import { uiFrame, type Screen } from './uiLayout';

// The game's flow (docs/design.md "Flow"): the first launch goes straight into chapter 1,
// afterwards lobby -> run -> results -> lobby. Owns the save, the current screen and the
// current run, and tells the portal when gameplay starts and stops.
//
// Waves are counted here from the sim tick (one every BALANCE.waveSeconds) until the engine
// runs real waves; a run ends at the last wave or when the player gives up.

const WAVE_TICKS = BALANCE.waveSeconds * TICK_RATE;

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
    this.game = new Game(this.app, this.platform, this.art, this.scene, this.stick);
    if (this.quality) this.game.applyQuality(this.quality);
    // the run adds itself to the stage; keep the UI above it
    this.app.stage.addChild(this.ui);
    this.hud = new RunHud(BALANCE.waves, {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      giveUp: () => this.endRun(),
    });
    this.setScreen(this.hud);
    this.platform.portal.gameplayStart();
  }

  private setPaused(paused: boolean): void {
    if (!this.game) return;
    this.game.paused = paused;
    if (paused) this.platform.portal.gameplayStop();
    else this.platform.portal.gameplayStart();
  }

  private wavesCleared(): number {
    return this.game ? Math.min(BALANCE.waves, Math.floor(this.game.engine.state.tick / WAVE_TICKS)) : 0;
  }

  private endRun(): void {
    if (!this.game) return;
    const waves = this.wavesCleared();
    this.game.destroy();
    this.game = null;
    this.hud = null;
    this.platform.portal.gameplayStop();
    const { save, reward } = settleRun(this.save, { chapter: this.chapter, waves });
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
    if (this.game && this.hud && !this.game.paused) {
      const waves = this.wavesCleared();
      if (waves >= BALANCE.waves) this.endRun();
      else this.hud.setWave(waves + 1);
    }
  }
}
