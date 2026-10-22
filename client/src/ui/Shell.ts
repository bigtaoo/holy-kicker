import { Container, type Application } from 'pixi.js';
import { isBossWave, SUTRA_IDS, TICK_RATE, type MonkId, type SimState } from '@hk/engine';
import { Game, STICK_RADIUS, type Art } from '../game/Game';
import { DragStick } from '../game/dragStick';
import type { LevelSettings, QualityMode } from '../game/quality';
import { rankedRun, type SceneOptions } from '../game/scene';
import { computeViewport } from '../game/viewport';
import { setupOf } from '../game/runSetup';
import { BALANCE } from '../meta/balance';
import { challengeSetup } from '../meta/challenge';
import { evolvedIn } from '../meta/codex';
import { noteFall, runPast } from '../meta/falls';
import { loadout } from '../meta/loadout';
import { rollDay } from '../meta/daily';
import { fixPatrolClock, startPatrol } from '../meta/patrol';
import { chooseTrack, doubleCopper, earnedSutras, selectChapter, settleRun, type Reward, type Tab } from '../meta/progress';
import { dropRun, keepRun, loadRun, type SavedRun } from '../meta/resume';
import type { SaveData } from '../meta/save';
import { lobbyWaiting, lossStep, waitingCount } from '../meta/waiting';
import { afterRun } from '../meta/welcome';
import type { SaveStore } from '../meta/saveStore';
import { loadSettings, updateSettings } from '../meta/settings';
import { bracketed } from '../platform/brackets';
import type { Ads, Platform, Portal } from '../platform/types';
import { Sound } from '../audio/Sound';
import { languageProps, type Backend, type RunRank, type RunResult } from '../net/backend';
import { runLeave } from '../net/leaveProps';
import type { PerfReport } from '../net/perfReport';
import { RunReplays } from '../net/runReplays';
import type { Challenge, Device, PropValue } from '@hk/protocol';
import { eventCue } from '../game/soundCues';
import { loadMonkArt } from '../art';
import { chapterLook, loadChapterArt, loadRunArt } from '../chapterArt';
import { monkRig } from '../game/artTypes';
import { menuBackdrop } from './lobbyBars';
import { LobbyScreen } from './LobbyScreen';
import { LobbyArtLoad } from './lobbyArtLoad';
import { ChallengeFlow } from './challengeFlow';
import { ChallengeResultsScreen } from './ChallengeResultsScreen';
import { ResultsScreen } from './ResultsScreen';
import { ResumeScreen } from './ResumeScreen';
import { RunHud } from './RunHud';
import { keepLanguage, storedSettings, type SettingsActions } from './settingsPanel';
import { canReport, reportProblem } from './problemReport';
import { PlayerName } from './playerName';
import type { DownInfo } from './deathInfo';
import { RunWatch } from './runWatch';
import { ReplayScreen, type ReplayView } from './replayWatch';
import { uiFrame, type Screen } from './uiLayout';
import { onButtonTap } from './widgets';

// The game's flow (docs/design.md "Flow"): the first launch goes straight into chapter 1, afterwards lobby -> run ->
// results -> lobby. Owns the save, the current screen and the current run, and tells the portal when gameplay starts and
// stops. The engine runs the chapter's waves; RunWatch follows each run frame by frame. A run ends won, lost, or when the
// player gives up; a lost one's results offer to play the chapter again.

const RESUME_FROM_WAVE = 3; // the first wave a run left unfinished must have reached to be offered again on the next launch

export class Shell {
  private save: SaveData;
  private readonly stick = new DragStick(STICK_RADIUS);
  /** Screens draw over the run. */
  private readonly ui = new Container();
  private screen: Screen | null = null;
  private shownMs = 0; // milliseconds on screen since the last `leave` event
  private game: Game | null = null;
  private hud: RunHud | null = null;
  private watch: RunWatch | null = null;
  private chapter = 1;
  private hard = false; // the run in play is hard mode
  private screenKey = '';
  private bannerUp = false; // the lobby's banner is up: its band is kept clear like a safe-area inset
  private quality: LevelSettings | null = null;
  /** Switches the render quality mode (boot.ts wires it to the quality runtime). */
  onQualityMode: (mode: QualityMode) => void = () => {};
  /** The `perf` sender (boot.ts feeds it the battle frames); a meter per real run. */
  perf: PerfReport | null = null;
  /** Free revives (training) left in this run; they come before the rewarded-ad one. */
  private freeRevives = 0;
  private kills = 0; // enemies defeated in this run, for the daily tasks
  private loading = false; // a chapter's art pack is being fetched; taps on play wait for it
  private readonly lobbyArt: LobbyArtLoad;
  private readonly challenge: ChallengeFlow; // the challenges: their records, the run in play and its replay, the weeks to pay
  private readonly replays: RunReplays; // each real run's replay, while the server collects them
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
    /** The device's memory, cores and GPU class for `session` (net/perfReport.ts sessionDevice). */
    deviceProps: Record<string, PropValue> = {},
  ) {
    this.names = new PlayerName(net, platform.storage, platform.portal);
    this.lobbyArt = new LobbyArtLoad(platform, art, this.app.renderer);
    this.replays = new RunReplays(net);
    this.challenge = new ChallengeFlow(net, () => (this.screenKey = ''), scene.challenge, scene.settleWeeks); // the lobby is drawn again when the record comes
    this.save = this.names.withDice(store.load());
    store.save(this.save);
    const settings = loadSettings(platform.storage);
    this.sound = new Sound(platform, settings.volume, settings.music);
    this.ads = this.sound.muteDuring(platform.ads);
    this.portal = bracketed(platform.portal);
    onButtonTap(() => this.sound.play('tap'));
    platform.bindStick(app, this.stick);
    platform.onKey?.((code, repeat) => this.screen?.key?.(code, repeat));
    // coming back to a run mid-fight is unfair; it waits on the pause panel instead, and is kept in case the game is closed for good
    platform.onHide(() => {
      this.hud?.pauseForHost();
      this.keepRun();
    });
    app.stage.addChild(this.ui);
    app.ticker.add(() => this.tick());
    net.track('session', { runs: this.save.runs, level: this.save.level, device: this.device, ...deviceProps, ...languageProps(platform, globalThis.navigator?.languages), ...platform.sessionProps?.() });
    net.onLeave(() => this.leaving());
  }

  /** Where the player is as the game goes to the background, and for how long it was on screen. */
  private leaving(): Record<string, PropValue> {
    const secs = Math.round(this.shownMs / 1000);
    this.shownMs = 0;
    const place = this.place();
    if (place === 'run' && this.game) return { place, secs, ...runLeave(this.game.engine.state, this.chapter, this.kills, this.watch?.tutorial?.step ?? null, this.platform.attention?.()) };
    return { place, secs };
  }

  /** Where the player is, as `leave` and `anomaly` name it. */
  place(): 'lobby' | 'results' | 'run' | 'other' {
    if (this.screen instanceof LobbyScreen) return 'lobby';
    if (this.screen instanceof ResultsScreen || this.screen instanceof ChallengeResultsScreen) return 'results';
    return this.game ? 'run' : 'other';
  }

  // The first screen, settled once it is up (`direct`, ?direct: no lobby); then the lobby's art, then chapter 2's.
  async start(direct = false): Promise<void> {
    await this.firstScreen(direct);
    void this.lobbyArt.ready().then(() => loadChapterArt(this.platform, this.scene, this.art, 2)).catch(() => undefined);
  }

  private async firstScreen(direct: boolean): Promise<void> {
    this.portal.loaded(); // before the first run's gameplayStart: CrazyGames ignores one sent while loading
    let left = direct ? null : loadRun(this.platform.storage);
    // a run left in its first waves is not worth a question: it starts over
    if (left && left.state.wave < RESUME_FROM_WAVE) {
      dropRun(this.platform.storage);
      left = null;
    }
    if (left) this.offerResume(left);
    else if (direct || !this.save.firstRunDone) await this.play(this.scene.chapter || this.save.chapter);
    else {
      await this.lobbyArt.ready();
      this.showLobby();
    }
  }

  get run(): Game | null { // the current run, for dev console hooks
    return this.game;
  }

  /** Records a share from the host's menu, with the screen it was made from. */
  shared(to: 'chat' | 'moments'): void {
    const from = this.screen instanceof LobbyScreen ? 'lobby' : this.place() === 'results' ? 'results' : 'run';
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

  /** `open` opens the lobby on its settings panel (after a language change) or on a tab (the results' next step). */
  private showLobby(open: 'settings' | Tab | null = null): void {
    if (!this.lobbyArt.in) {
      void this.lobbyArt.ready().then(() => this.showLobby(open));
      return;
    }
    // a new day's counters, and the patrol once it opens
    const now = Date.now();
    const save = startPatrol(fixPatrolClock(rollDay(this.save, now), now), now);
    if (save !== this.save) this.commit(save);
    // a renamed or newly signed-in portal account reaches the boards from here
    this.names.sync(this.save);
    loadMonkArt(this.platform, this.art, this.save.monk).catch(() => undefined); // the patrol panel shows the chosen monk
    this.challenge.refresh();
    const lobby = new LobbyScreen(this.save, this.names, {
      play: (chapter) => this.play(chapter),
      selectChapter: (chapter) => this.relobby(selectChapter(this.save, chapter)),
      chooseTrack: (hard) => this.relobby(chooseTrack(this.save, hard)),
      selectRelic: (relic) => this.relobby({ ...this.save, relic }),
      settings: storedSettings(this.platform.storage, this.sound, {
        setLanguage: () => this.showLobby('settings'),
        setQuality: (quality) => this.onQualityMode(quality),
        privacy: this.privacy, copyId: this.platform.copyText?.bind(this.platform),
        account: this.platform.portal, adPrivacy: this.platform.adPrivacy,
      }),
      commit: (save) => this.commit(save),
      adAvailable: () => this.ads.rewardedAvailable(),
      rewarded: () => this.rewarded('lobby'),
      board: this.net.online && this.names.ranked() ? (id) => this.net.board(id) : null, // no guests on account hosts
      challenge: () => this.challenge.lobby(this.save, this.names.ranked(), (c, chapter) => void this.play(chapter, undefined, null, c), (v) => this.watchReplay(v), (save) => this.relobby(save)),
      track: (e, p) => this.net.track(e, p), store: this.platform.store,
    }, this.art.icons, this.app.renderer, this.art.lobby, () => ({ rig: monkRig(this.art, this.save.monk), art: this.art.patrol, icons: this.art.icons }));
    if (open === 'settings') lobby.openSettings();
    else if (open) lobby.openTab(open);
    this.setScreen(lobby);
  }

  /** Keeps `save` and draws the lobby again with it. */
  private relobby(save: SaveData): void {
    this.commit(save);
    this.showLobby();
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
    this.setScreen(new ResumeScreen({ chapter: c.chapter, hard: c.hard, wave: left.state.wave, waves: c.waves }, { resume: () => { this.net.track('run_resume', { chapter: c.chapter, hard: c.hard, wave: Math.max(1, left.state.wave) }); void this.play(c.chapter, left); }, giveUp }, this.lobbyArt.ready().then(() => menuBackdrop(this.app.renderer, this.art.lobby)), this.device === 'desktop'));
  }

  /** Starts a run of `chapter` (or goes on with `left`; `from` the results' Play again or Next chapter) once its art is in (a later chapter's pack or a monk's rig may need fetching). */
  private play(chapter: number, left?: SavedRun, from: 'again' | 'next' | null = null, c: Challenge | null = null): Promise<void> {
    return this.withArt(chapter, left?.state.config.monk ?? (c?.loadout?.monk as MonkId | undefined) ?? this.scene.monk ?? this.save.monk, () => this.startRun(chapter, left, from, c));
  }

  /** Runs `then` once `chapter`'s art and `monk`'s rig are in; on a failure, the lobby (the next tap tries again). */
  private withArt(chapter: number, monk: MonkId, then: () => void): Promise<void> {
    if (this.loading) return Promise.resolve();
    this.loading = true;
    return loadRunArt(this.app.renderer, this.platform, this.scene, this.art, chapter, monk).then(() => {
      this.loading = false;
      then();
    }, (err: unknown) => {
      this.loading = false;
      console.error(err);
      this.showLobby();
    });
  }

  /** Watches a weekly's top run in the run view (ui/replayWatch.ts), with its sounds; Back goes to the lobby. */
  private watchReplay(v: ReplayView): void {
    void this.withArt(v.replay.config.chapter, v.replay.config.monk, () => {
      this.setScreen(new ReplayScreen(v, { back: () => this.showLobby(), game: (engine) => {
        const g = new Game(this.app, this.platform, this.art, { ...this.scene, autoplay: false, record: 0 }, this.stick, setupOf(engine.state.config), engine);
        if (this.quality) g.applyQuality(this.quality);
        g.onEvents = (events) => events.map((e) => eventCue(e, 0)).forEach((cue) => cue && this.sound.play(cue));
        this.app.stage.addChild(this.ui);
        return g;
      } }, this.art.icons));
      this.lobbyArt.free();
    });
  }

  /** `c`: a run of that daily challenge (its own setup, no revives, never kept for the next launch). */
  private startRun(chapter: number, left?: SavedRun, from: 'again' | 'next' | null = null, c: Challenge | null = null): void {
    c = this.challenge.begin(left ? null : c);
    this.chapter = chapter;
    this.hard = left ? left.state.config.hard : !c && (this.scene.hard || this.save.hard);
    this.setScreen(null);
    // no run draws the lobby: its art goes until the next lobby asks for it again
    this.lobbyArt.free();
    const { bonus, freeRevives } = loadout(this.save, chapter, this.hard);
    this.freeRevives = left ? left.freeRevives : c ? 0 : freeRevives;
    this.game = new Game(this.app, this.platform, this.art, this.scene, this.stick, left ? setupOf(left.state.config) : c ? challengeSetup(this.save, c) : {
      chapter,
      waves: this.scene.waves ? BALANCE.waves : 0,
      revives: BALANCE.revives + freeRevives,
      relic: this.scene.relic ?? this.save.relic,
      sutras: this.scene.sutras ? SUTRA_IDS : earnedSutras(this.save),
      bonus: this.scene.bare ? {} : bonus,
      hard: this.hard,
      monk: this.scene.monk ?? this.save.monk, firstRun: !this.save.firstRunDone && this.scene.waves,
    }, left?.state);
    this.replays.begin(this.game, rankedRun(this.scene) && !this.scene.record);
    this.kills = left?.kills ?? 0;
    this.perf?.start(rankedRun(this.scene) && !this.scene.record);
    if (this.quality) this.game.applyQuality(this.quality);
    this.game.shake.on = loadSettings(this.platform.storage).shake;
    this.game.onEvents = (events) => {
      this.watch?.see(events);
      for (const e of events) {
        if (e.type === 'mobDown') this.kills++;
        const cue = eventCue(e, 0);
        if (cue) this.sound.play(cue);
      }
    };
    this.game.onHeartbeat = () => this.sound.play('heartbeat');
    // the run adds itself to the stage; keep the UI above it
    this.app.stage.addChild(this.ui);
    this.hud = new RunHud(this.game.engine.state.config.waves || BALANCE.waves, this.hard, {
      pause: () => this.setPaused(true),
      resume: () => this.setPaused(false),
      setFast: (fast) => {
        if (this.game) this.game.speed = fast ? 2 : 1;
        updateSettings(this.platform.storage, { fast });
      },
      giveUp: () => this.endRun(),
      revive: () => this.revive(),
      pick: (index) => this.game?.pick(index),
      setLanguage: (locale) => keepLanguage(this.platform.storage, locale),
      report: canReport(this.net, import.meta.env.DEV) ? () => reportProblem(this.platform, this.net, () => this.game, this.scene) : null,
    }, this.art.icons, this.device === 'desktop', () => this.platform.keysReach?.() ?? true);
    this.setScreen(this.hud);
    // the first run teaches moving; a replayed first chapter, a resumed run or a dev bot's does not
    const teach = !this.save.firstRunDone && this.scene.waves && !left && !this.scene.autoplay && !this.scene.record;
    this.watch = new RunWatch(this.game, this.hud, {
      chapter, novice: this.save.runs < BALANCE.novice.runs, portal: this.portal, ads: this.ads, net: this.net, past: runPast(this.save, chapter, this.hard),
      freeRevives: () => this.freeRevives,
      kills: () => this.kills, keepRun: () => this.keepRun(), end: () => this.endRun(), cheer: () => this.sound.play('cleared'),
    }, !!teach);
    // the fast-forward choice carries over from the last run
    this.hud.setFast(loadSettings(this.platform.storage).fast);
    this.portal.gameplayStart();
    // a resumed fight waits on the pause panel until the player looks (a card choice or the death panel holds it anyway)
    const s = this.game.engine.state;
    if (!left) this.net.track('run_start', { chapter, hard: this.hard, monk: c?.loadout?.monk ?? this.scene.monk ?? this.save.monk, relic: c?.loadout?.relic ?? this.scene.relic ?? this.save.relic, ...(from && { [from]: true }), ...(c && { challenge: c.id }) });
    else if (s.outcome === 'playing' && s.players[0].offer.length === 0) this.hud.pauseForHost();
  }

  /** Keeps the run in play for the next launch (meta/resume.ts); not the sandbox or a dev bot's run. */
  private keepRun(): void {
    const s = this.game?.engine.state;
    if (!s || s.config.waves === 0 || this.scene.autoplay || this.scene.record || this.challenge.run) return;
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
    this.game.paused = paused;
    this.portal[paused ? 'gameplayStop' : 'gameplayStart']();
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
    this.challenge.capture(this.game);
    void this.replays.end();
    this.game.destroy();
    this.game = null;
    this.hud = null;
    // the death panel already told the portal
    if (!this.watch?.downShown) this.portal.gameplayStop();
    const fall = this.watch?.fall ?? null;
    this.watch = null;
    this.settle(s, fall);
  }

  // Pays out the run that ended in `s` (`waves` fully cleared), tells the backend, enters it on its board when no dev switch
  // bent the rules (the results show the rank once it comes) and shows the results, with what felled the hero (`fall`).
  private settle(s: SimState, fall: DownInfo | null = null): void {
    const cause = fall?.cause;
    dropRun(this.platform.storage);
    const waves = s.outcome === 'won' ? s.config.waves : Math.max(0, s.wave - 1);
    const p = s.players[0];
    const run = {
      chapter: this.chapter, hard: this.hard, won: s.outcome === 'won', wave: Math.max(1, s.wave), tenths: Math.round((s.tick * 10) / TICK_RATE),
      level: p.level, kills: this.kills, monk: p.monk, relic: p.relicId,
    };
    this.perf?.end();
    this.net.track('run_end', { ...run, gaveUp: s.outcome === 'playing', ...(s.outcome === 'lost' && cause ? { cause } : {}), ...(this.challenge.run && { challenge: this.challenge.run.id }) });
    const name = rankedRun(this.scene) ? this.names.board(this.save) : null;
    const rank = name && !this.challenge.run ? this.net.submitRun({ ...run, ...name }) : Promise.resolve(null);
    void this.net.flush();
    if (this.challenge.run) return this.settleChallenge(s, { ...run, ...name }, waves, !!name);
    const { reward, save: played } = settleRun(noteFall(this.save, this.chapter, this.hard, s), { chapter: this.chapter, hard: this.hard, waves, offerings: p.offerings, evolved: evolvedIn(p), kills: this.kills, revived: p.revives < s.config.revives, lowest: p.lowest });
    const { save, gift } = afterRun(played, Date.now(), waves, this.kills);
    // paid before the results show, so closing the tab now keeps the reward
    this.commit(save);
    if (gift) this.net.track('claim', { what: 'gift', n: 0, copper: gift.copper, jade: gift.jade, drops: gift.drops.length });
    if (reward.firstClear) this.portal.celebrate();
    this.showResults({ ...reward, gift }, waves, rank, s.outcome === 'lost' ? fall : null);
  }

  /** A challenge run's end: its milestones paid (the day's first run only), sent with its replay, and its own results. */
  private settleChallenge(s: SimState, run: RunResult, waves: number, ranked: boolean): void {
    const done = this.challenge.settle(this.save, s, run, waves, this.kills, ranked);
    this.commit(afterRun(done.save, Date.now(), waves, this.kills).save);
    this.setScreen(new ChallengeResultsScreen(done, {
      double: async () => {
        const paid = await this.rewarded('double');
        if (paid) this.commit({ ...this.save, copper: this.save.copper + done.reward.copper });
        return paid;
      },
      next: () => void this.ads.midgame().then(() => this.showLobby()),
    }, this.ads.rewardedAvailable(), this.art.icons, this.device === 'desktop', menuBackdrop(this.app.renderer, this.art.lobby)));
  }

  private showResults(reward: Reward, waves: number, rank: Promise<RunRank | null>, fall: DownInfo | null): void {
    let leaving = false;
    // the interstitial sits on the break after the results, never inside a run, and never after the first run (the tutorial)
    const leave = (then: () => void) => {
      if (leaving) return;
      leaving = true;
      void (this.save.runs > 1 ? this.ads.midgame() : Promise.resolve()).then(then);
    };
    // a lost run's way back is the same chapter again (not the tutorial: firstRunDone is set), a first clear's the chapter it opened
    const opened = reward.firstClear && (this.save.chapter !== this.chapter || this.save.hard !== this.hard);
    this.setScreen(new ResultsScreen(reward, waves, {
      double: async () => {
        const paid = await this.rewarded('double');
        if (paid) this.commit(doubleCopper(this.save, reward));
        return paid;
      },
      next: (tab) => leave(() => this.showLobby(tab)),
      again: !reward.firstClear ? () => leave(() => this.play(this.chapter, undefined, 'again')) : opened ? () => leave(() => this.play(this.save.chapter, undefined, 'next')) : null,
      waiting: () => waitingCount(lobbyWaiting(this.save, Date.now())), step: () => (fall ? lossStep(this.save) : null),
      // the opened chapter's art, loaded now for its preview and the run Next chapter starts
      preview: opened ? chapterLook(this.platform, this.scene, this.art, this.save.chapter).catch(() => null) : undefined,
    }, this.ads.rewardedAvailable(), rank, fall, this.art.icons, this.device === 'desktop', menuBackdrop(this.app.renderer, this.art.lobby)));
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
    // the run has the battle music (the boss's on the mid-boss and boss waves, through to the results), every screen around it the lobby's
    const s = this.game?.engine.state;
    this.sound.flush(s ? (s.config.waves > 0 && isBossWave(s.wave, s.config.waves) ? 'boss' : 'battle') : 'lobby', this.app.ticker.deltaMS, this.game?.downCamBusy() ? 0.25 : 1);
  }
}
