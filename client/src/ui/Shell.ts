import { Container, type Application } from 'pixi.js';
import { isBossWave, SUTRA_IDS, TICK_RATE, type SimState } from '@hk/engine';
import { setLocale, type Locale } from '../i18n';
import { Game, STICK_RADIUS, type Art } from '../game/Game';
import { DragStick } from '../game/dragStick';
import type { LevelSettings, QualityMode } from '../game/quality';
import { rankedRun, type SceneOptions } from '../game/scene';
import { computeViewport } from '../game/viewport';
import { setupOf } from '../game/runSetup';
import { BALANCE } from '../meta/balance';
import { evolvedIn } from '../meta/codex';
import { loadout } from '../meta/loadout';
import { rollDay } from '../meta/daily';
import { fixPatrolClock, startPatrol } from '../meta/patrol';
import { chooseTrack, doubleCopper, earnedSutras, settleRun, type Reward } from '../meta/progress';
import { dropRun, keepRun, loadRun, type SavedRun } from '../meta/resume';
import type { SaveData } from '../meta/save';
import { afterRun } from '../meta/welcome';
import type { SaveStore } from '../meta/saveStore';
import { loadSettings, updateSettings } from '../meta/settings';
import { bracketed } from '../platform/brackets';
import type { Ads, Platform, Portal } from '../platform/types';
import { Sound } from '../audio/Sound';
import { languageProps, type Backend, type RunRank } from '../net/backend';
import { runLeave } from '../net/leaveProps';
import type { Device, PropValue } from '@hk/protocol';
import { eventCue } from '../game/soundCues';
import { loadChapterArt, loadMonkArt } from '../art';
import { monkRig } from '../game/artTypes';
import { LobbyScreen } from './LobbyScreen';
import { ResultsScreen } from './ResultsScreen';
import { ResumeScreen } from './ResumeScreen';
import { RunHud } from './RunHud';
import { storedSettings, type SettingsActions } from './settingsPanel';
import { canReport, reportProblem } from './problemReport';
import { PlayerName } from './playerName';
import { RunWatch } from './runWatch';
import { uiFrame, type Screen } from './uiLayout';
import { onButtonTap } from './widgets';

// The game's flow (docs/design.md "Flow"): the first launch goes straight into chapter 1,
// afterwards lobby -> run -> results -> lobby. Owns the save, the current screen and the
// current run, and tells the portal when gameplay starts and stops.
//
// The engine runs the chapter's waves; RunWatch follows each run frame by frame. A run ends won,
// lost, or when the player gives up; a lost one's results offer to play the chapter again.

/** The first wave a run left unfinished must have reached to be offered again on the next launch. */
const RESUME_FROM_WAVE = 3;

export class Shell {
  private save: SaveData;
  private readonly stick = new DragStick(STICK_RADIUS);
  /** Screens draw over the run. */
  private readonly ui = new Container();
  private screen: Screen | null = null;
  /** Milliseconds on screen since the last `leave` event. */
  private shownMs = 0;
  private game: Game | null = null;
  private hud: RunHud | null = null;
  private watch: RunWatch | null = null;
  private chapter = 1;
  /** The run in play is hard mode. */
  private hard = false;
  private screenKey = '';
  /** The lobby's banner is up: its band is kept clear like a safe-area inset. */
  private bannerUp = false;
  private quality: LevelSettings | null = null;
  /** Switches the render quality mode (boot.ts wires it to the quality runtime). */
  onQualityMode: (mode: QualityMode) => void = () => {};
  /** Free revives (training) left in this run; they come before the rewarded-ad one. */
  private freeRevives = 0;
  /** Enemies defeated in this run, for the daily tasks. */
  private kills = 0;
  /** A chapter's art pack is being fetched; taps on play wait for it. */
  private loading = false;
  readonly sound: Sound;
  /** The host's ads, with the game silent while one plays. */
  private readonly ads: Ads;
  /** The host's session hooks, each gameplay start or stop sent once. */
  private readonly portal: Portal;
  private readonly names: PlayerName;

  constructor(
    private readonly app: Application,
    private readonly platform: Platform,
    private readonly art: Art,
    private readonly scene: SceneOptions,
    private readonly store: SaveStore,
    /** Analytics and the leaderboard (net/backend.ts). */
    private readonly net: Backend,
    /** The kind of device (analytics); on a desktop the first run's move hint also names the keyboard. */
    private readonly device: Device = 'mobile',
    private readonly privacy: SettingsActions['privacy'] = null, // the player's privacy answer (net/privacyChoice.ts); null offline
  ) {
    this.names = new PlayerName(net, platform.storage, platform.portal);
    this.save = this.names.withDice(store.load());
    store.save(this.save);
    const settings = loadSettings(platform.storage);
    this.sound = new Sound(platform, settings.volume, settings.music);
    this.ads = this.sound.muteDuring(platform.ads);
    this.portal = bracketed(platform.portal);
    onButtonTap(() => this.sound.play('tap'));
    platform.bindStick(app, this.stick);
    // coming back to a run mid-fight is unfair; it waits on the pause panel instead, and is kept
    // in case the game is closed for good
    platform.onHide(() => {
      this.hud?.pauseForHost();
      this.keepRun();
    });
    app.stage.addChild(this.ui);
    app.ticker.add(() => this.tick());
    net.track('session', { runs: this.save.runs, level: this.save.level, device: this.device, ...languageProps(platform, globalThis.navigator?.languages), ...platform.sessionProps?.() });
    net.onLeave(() => this.leaving());
  }

  /** Where the player is as the game goes to the background, and for how long it was on screen. */
  private leaving(): Record<string, PropValue> {
    const secs = Math.round(this.shownMs / 1000);
    this.shownMs = 0;
    if (this.screen instanceof LobbyScreen) return { place: 'lobby', secs };
    if (this.screen instanceof ResultsScreen) return { place: 'results', secs };
    if (this.game) return { place: 'run', secs, ...runLeave(this.game.engine.state, this.chapter, this.kills, this.watch?.tutorial?.step ?? null) };
    return { place: 'other', secs };
  }

  /** `direct` skips the lobby, for stress tests and screenshots (?direct). */
  start(direct = false): void {
    this.portal.loaded(); // before the first run's gameplayStart: CrazyGames ignores one sent while loading
    let left = direct ? null : loadRun(this.platform.storage);
    // a run left in its first waves is not worth a question: it starts over
    if (left && left.state.wave < RESUME_FROM_WAVE) {
      dropRun(this.platform.storage);
      left = null;
    }
    if (left) this.offerResume(left);
    else if (direct || !this.save.firstRunDone) this.play(this.scene.chapter || this.save.chapter);
    else this.showLobby();
  }

  /** The current run, for dev console hooks. */
  get run(): Game | null {
    return this.game;
  }

  /** Records a share from the host's menu, with the screen it was made from. */
  shared(to: 'chat' | 'moments'): void {
    const from = this.screen instanceof LobbyScreen ? 'lobby' : this.screen instanceof ResultsScreen ? 'results' : 'run';
    this.net.track('share', { to, from });
  }

  applyQuality(s: LevelSettings): void {
    this.quality = s;
    this.game?.applyQuality(s);
  }

  /** Re-reads the save after the portal account changed (a guest signed in). */
  reloadSave(): void {
    this.save = this.names.withDice(this.store.load());
    if (this.screen instanceof LobbyScreen) this.showLobby();
  }

  private setScreen(screen: Screen | null): void {
    // the banner goes up on the way into the lobby (not on each rebuild of it) and down on the way out
    const lobby = screen instanceof LobbyScreen;
    if (!lobby) {
      this.platform.banner.hide();
      this.bannerUp = false;
    } else if (!(this.screen instanceof LobbyScreen)) {
      void this.platform.banner.show().then((up) => {
        this.bannerUp = up && this.screen instanceof LobbyScreen;
        this.screenKey = '';
      });
    }
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
    // a rolled name reaches the boards from here
    this.names.sync(save);
  }

  /** `settings` opens the lobby on its settings panel (after a language change). */
  private showLobby(settings = false): void {
    // a new day's counters, and the patrol once it opens
    const now = Date.now();
    const save = startPatrol(fixPatrolClock(rollDay(this.save, now), now), now);
    if (save !== this.save) this.commit(save);
    // a renamed or newly signed-in portal account reaches the boards from here
    this.names.sync(this.save);
    // the patrol panel shows the chosen monk
    loadMonkArt(this.platform, this.art, this.save.monk).catch(() => undefined);
    const lobby = new LobbyScreen(this.save, this.names, {
      play: (chapter) => this.play(chapter),
      selectChapter: (chapter) => {
        this.commit({ ...this.save, chapter });
        this.showLobby();
      },
      chooseTrack: (hard) => {
        this.commit(chooseTrack(this.save, hard));
        this.showLobby();
      },
      selectRelic: (relic) => {
        this.commit({ ...this.save, relic });
        this.showLobby();
      },
      settings: storedSettings(this.platform.storage, this.sound, {
        setLanguage: (locale) => this.setLanguage(locale),
        setQuality: (quality) => this.onQualityMode(quality),
        privacy: this.privacy,
        account: this.platform.portal, adPrivacy: this.platform.adPrivacy,
      }),
      commit: (save) => this.commit(save),
      adAvailable: () => this.ads.rewardedAvailable(),
      rewarded: () => this.rewarded('lobby'),
      board: this.net.online && this.names.ranked() ? (id) => this.net.board(id) : null, // no guests on account hosts
      track: (e, p) => this.net.track(e, p), store: this.platform.store,
    }, this.art.icons, this.app.renderer, this.art.lobby, () => ({ rig: monkRig(this.art, this.save.monk), art: this.art.patrol, icons: this.art.icons }));
    if (settings) lobby.openSettings();
    this.setScreen(lobby);
  }

  private setLanguage(locale: Locale): void {
    this.keepLanguage(locale);
    this.showLobby(true);
  }

  private keepLanguage(locale: Locale): void {
    setLocale(locale);
    updateSettings(this.platform.storage, { locale });
  }

  /** The last run was left unfinished: go on with it, or give it up (settled like a give-up in the run). */
  private offerResume(left: SavedRun): void {
    const { config: c, outcome, players } = left.state;
    const giveUp = () => {
      [this.chapter, this.hard, this.kills] = [c.chapter, c.hard, left.kills];
      this.settle(left.state);
    };
    // fallen with no revive left, there is nothing to go on with
    if (outcome === 'lost' && players[0].revives === 0) return giveUp();
    this.setScreen(new ResumeScreen({ chapter: c.chapter, hard: c.hard, wave: left.state.wave, waves: c.waves }, { resume: () => this.play(c.chapter, left), giveUp }));
  }

  /** Starts a run of `chapter` (or goes on with `left`) once its art is in (a later chapter's pack or a monk's rig may need fetching). */
  private play(chapter: number, left?: SavedRun): void {
    if (this.loading) return;
    this.loading = true;
    const monk = left?.state.config.monk ?? this.scene.monk ?? this.save.monk;
    Promise.all([loadChapterArt(this.platform, this.scene, this.art, chapter), loadMonkArt(this.platform, this.art, monk)]).then(
      () => {
        this.loading = false;
        this.startRun(chapter, left);
      },
      (err: unknown) => {
        // stay in (or go back to) the lobby; the next tap tries again
        this.loading = false;
        console.error(err);
        this.showLobby();
      },
    );
  }

  private startRun(chapter: number, left?: SavedRun): void {
    this.chapter = chapter;
    this.hard = left ? left.state.config.hard : this.scene.hard || this.save.hard;
    this.setScreen(null);
    const { bonus, freeRevives } = loadout(this.save, chapter, this.hard);
    this.freeRevives = left ? left.freeRevives : freeRevives;
    this.game = new Game(this.app, this.platform, this.art, this.scene, this.stick, left ? setupOf(left.state.config) : {
      chapter,
      waves: this.scene.waves ? BALANCE.waves : 0,
      revives: BALANCE.revives + freeRevives,
      relic: this.scene.relic ?? this.save.relic,
      sutras: this.scene.sutras ? SUTRA_IDS : earnedSutras(this.save),
      bonus: this.scene.bare ? {} : bonus,
      hard: this.hard,
      monk: this.scene.monk ?? this.save.monk, firstRun: !this.save.firstRunDone && this.scene.waves,
    }, left?.state);
    this.kills = left?.kills ?? 0;
    if (this.quality) this.game.applyQuality(this.quality);
    this.game.onEvents = (events) => {
      for (const e of events) {
        if (e.type === 'mobDown') this.kills++;
        const cue = eventCue(e, 0);
        if (cue) this.sound.play(cue);
      }
    };
    // the run adds itself to the stage; keep the UI above it
    this.app.stage.addChild(this.ui);
    this.hud = new RunHud(BALANCE.waves, this.hard, {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      setFast: (fast) => {
        if (this.game) this.game.speed = fast ? 2 : 1;
        updateSettings(this.platform.storage, { fast });
      },
      giveUp: () => this.endRun(),
      revive: () => this.revive(),
      pick: (index) => this.game?.pick(index),
      setLanguage: (locale) => this.keepLanguage(locale),
      report: canReport(this.net, import.meta.env.DEV) ? () => reportProblem(this.platform, this.net, () => this.game, this.scene) : null,
    }, this.art.icons, this.device === 'desktop');
    this.setScreen(this.hud);
    // the first run teaches moving (and waits for the first input); a replayed first chapter, a resumed run or a dev bot's does not
    const teach = !this.save.firstRunDone && this.scene.waves && !left && !this.scene.autoplay && !this.scene.record;
    this.watch = new RunWatch(this.game, this.hud, {
      chapter, portal: this.portal, ads: this.ads, net: this.net,
      freeRevives: () => this.freeRevives,
      input: () => this.stick.origin() !== null || this.platform.readKeys().x !== 0 || this.platform.readKeys().y !== 0,
      keepRun: () => this.keepRun(), end: () => this.endRun(),
    }, !!teach);
    // the fast-forward choice carries over from the last run
    this.hud.setFast(loadSettings(this.platform.storage).fast);
    this.portal.gameplayStart();
    // a resumed fight waits on the pause panel until the player looks (a card choice or the death panel holds it anyway)
    const s = this.game.engine.state;
    if (!left) this.net.track('run_start', { chapter, hard: this.hard, monk: this.scene.monk ?? this.save.monk, relic: this.scene.relic ?? this.save.relic });
    else if (s.outcome === 'playing' && s.players[0].offer.length === 0) this.hud.pauseForHost();
  }

  /** Keeps the run in play for the next launch (meta/resume.ts); not the sandbox or a dev bot's run. */
  private keepRun(): void {
    const s = this.game?.engine.state;
    if (!s || s.config.waves === 0 || this.scene.autoplay || this.scene.record) return;
    keepRun(this.platform.storage, { state: s, freeRevives: this.freeRevives, kills: this.kills });
  }

  /** A rewarded ad, counted when it paid (`at` says where it was offered). */
  private async rewarded(at: string): Promise<boolean> {
    const paid = await this.ads.rewarded();
    if (paid) this.net.track('ad', this.ads.adFree() ? { at, free: true } : { at });
    return paid;
  }

  private setPaused(paused: boolean): void {
    if (!this.game) return;
    // the first run's hold outlasts the pause panel
    this.game.paused = paused || !!this.watch?.holding;
    if (paused) this.portal.gameplayStop();
    else this.portal.gameplayStart();
  }

  private async revive(): Promise<boolean> {
    if (this.freeRevives > 0 && this.game) {
      this.freeRevives--;
      this.game.revive();
      return true;
    }
    const paid = await this.rewarded('revive');
    if (!paid || !this.game) return false;
    // the engine stands the hero up on its next tick; watchRun then resumes the portal
    this.game.revive();
    return true;
  }

  private endRun(): void {
    if (!this.game) return;
    const s = this.game.engine.state;
    this.game.destroy();
    this.game = null;
    this.hud = null;
    // the death panel already told the portal
    if (!this.watch?.downShown) this.portal.gameplayStop();
    this.watch = null;
    this.settle(s);
  }

  /**
   * Pays out the run that ended in `s` (won, lost or given up; `waves` are the ones fully cleared)
   * and shows the results. Tells the backend how it went, and enters it on its board when no dev
   * switch bent the rules; the results show its rank there once it comes (none offline, unranked or failed).
   */
  private settle(s: SimState): void {
    dropRun(this.platform.storage);
    const waves = s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
    const p = s.players[0];
    const run = {
      chapter: this.chapter, hard: this.hard, won: s.outcome === 'won', wave: Math.max(1, s.wave), tenths: Math.round((s.tick * 10) / TICK_RATE),
      level: p.level, kills: this.kills, monk: p.monk, relic: p.relicId,
    };
    this.net.track('run_end', { ...run, gaveUp: s.outcome === 'playing' });
    const name = rankedRun(this.scene) ? this.names.board(this.save) : null;
    const rank = name ? this.net.submitRun({ ...run, ...name }) : Promise.resolve(null);
    void this.net.flush();
    const { reward, save: played } = settleRun(this.save, { chapter: this.chapter, hard: this.hard, waves, offerings: p.offerings, evolved: evolvedIn(p), kills: this.kills });
    const { save, gift } = afterRun(played, Date.now(), waves, this.kills);
    // paid before the results show, so closing the tab now keeps the reward
    this.commit(save);
    if (gift) this.net.track('claim', { what: 'gift', n: 0, copper: gift.copper, jade: gift.jade, drops: gift.drops.length });
    if (reward.firstClear) this.portal.celebrate();
    this.showResults({ ...reward, gift }, waves, rank);
  }

  private showResults(reward: Reward, waves: number, rank: Promise<RunRank | null>): void {
    let leaving = false;
    // the interstitial sits on the break after the results, never inside a run, and never after
    // the first run (the tutorial), so a new player reaches the lobby before any ad
    const leave = (then: () => void) => {
      if (leaving) return;
      leaving = true;
      void (this.save.runs > 1 ? this.ads.midgame() : Promise.resolve()).then(then);
    };
    this.setScreen(new ResultsScreen(reward, waves, {
      double: async () => {
        const paid = await this.rewarded('double');
        if (paid) this.commit(doubleCopper(this.save, reward));
        return paid;
      },
      next: () => leave(() => this.showLobby()),
      // once the lobby has been seen, a lost run's quickest way back is the same chapter again
      again: this.save.runs > 1 && !reward.firstClear ? () => leave(() => this.play(this.chapter)) : null,
    }, this.ads.rewardedAvailable(), rank));
  }

  private tick(): void {
    // frames only come while the game is on screen; a long stall (a breakpoint, a suspended tab) counts as one second
    this.shownMs += Math.min(this.app.ticker.deltaMS, 1000);
    const { width, height } = this.app.screen;
    const key = `${width}x${height}`;
    if (this.screen && key !== this.screenKey) {
      this.screenKey = key;
      const insets = this.platform.safeInsets();
      if (this.bannerUp) insets.bottom += this.platform.banner.height;
      this.screen.layout(uiFrame(computeViewport(width, height, this.scene.record > 0), insets));
    }
    if (this.watch) this.watch.update(this.app.ticker.deltaMS / 1000);
    else this.screen?.update?.(this.app.ticker.deltaMS / 1000);
    // the run has the battle music (the boss's on the mid-boss and boss waves, through to the
    // results), every screen around it the lobby's
    const s = this.game?.engine.state;
    this.sound.flush(s ? (s.config.waves > 0 && isBossWave(s.wave, s.config.waves) ? 'boss' : 'battle') : 'lobby', this.app.ticker.deltaMS);
  }
}
