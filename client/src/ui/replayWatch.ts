import { Container, Graphics } from 'pixi.js';
import { replayEngine, type Engine, type Replay } from '@hk/engine';
import type { PickWire } from '@hk/protocol';
import type { Game } from '../game/Game';
import { t } from '../i18n';
import type { IconSheet } from './buildBar';
import { pickTimeline } from './pickTimeline';
import { behind, pickAt, stepToward, type SeekTarget } from './replaySeek';
import type { Screen, UiFrame } from './uiLayout';
import { COLORS, button, fit, label } from './widgets';

// Watching one of a weekly's top runs (docs/design.md "Challenges"): the replay played through
// the run view itself (game/Game.ts in its watch mode, fed by the replay's input source), with
// play and pause, 1x, 2x or 4x, a jump to the previous or next wave, and the run's pick timeline,
// where a tap jumps to that pick. A seek steps a bare engine to the target a few hundred ticks a
// frame (ui/replaySeek.ts: the one in hand when the target lies ahead, a fresh one from the
// replay's start when behind), then builds the run view around it, as a resumed run is built.

/** A replay to watch: the run, its pick timeline and whose it is. */
export interface ReplayView {
  replay: Replay;
  picks: PickWire[];
  name: string;
  /** The tick to start watching from (a pick tapped on the board's timeline); the start when absent. */
  from?: number;
}

export interface ReplayHost {
  /** A run view watching `engine`, on the stage under the UI (its art already in). */
  game(engine: Engine): Game;
  back(): void;
}

const SPEEDS = [1, 2, 4];
const TIMELINE_H = 300;
const BAR_H = 150;

export class ReplayScreen implements Screen {
  readonly view = new Container();
  private game: Game;
  private frame: UiFrame | null = null;
  private speed = 1;
  /** A seek under way: its target and the engine stepping toward it; play resumes after it unless paused. */
  private seek: { target: SeekTarget; engine: Engine; paused: boolean } | null = null;
  private shown = '';

  constructor(private readonly w: ReplayView, private readonly host: ReplayHost, private readonly icons: IconSheet) {
    this.game = this.watch(replayEngine(w.replay));
    if (w.from) this.seekTo({ tick: w.from });
  }

  /** The replayed run plays in landscape. */
  get wide(): boolean {
    return this.game.engine.state.config.wide === true;
  }

  private get end(): number {
    return this.w.replay.tick;
  }

  private watch(engine: Engine): Game {
    const g = this.host.game(engine);
    g.watchEnd = this.end;
    g.speed = this.speed;
    return g;
  }

  layout(f: UiFrame): void {
    this.frame = f;
    this.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.view.position.set(f.x, f.y);
    this.view.scale.set(f.scale);
    const s = this.game.engine.state;
    const ended = s.tick >= this.end && !this.seek;
    this.shown = this.stateKey();
    // top: whose run, and the wave
    this.view.addChild(new Graphics().rect(0, -f.h, f.w, f.h + 170).fill({ color: COLORS.bg, alpha: 0.75 }));
    const who = fit(label(t('weekly.replayOf', { name: this.w.name }), 52, COLORS.saffron), f.w - 80);
    who.position.set(f.w / 2, 60);
    const wave = label(this.seek ? t('weekly.seeking') : ended ? t('weekly.ended') : t('board.wave', { wave: Math.max(1, s.wave) }), 48, COLORS.text);
    wave.position.set(f.w / 2, 125);
    this.view.addChild(who, wave);
    // bottom: the timeline, and the controls under it
    const barY = f.h - BAR_H / 2 - 20;
    const tlTop = barY - BAR_H / 2 - TIMELINE_H - 30;
    this.view.addChild(new Graphics().rect(0, tlTop - 30, f.w, 2 * f.h).fill({ color: COLORS.bg, alpha: 0.75 }));
    if (this.w.picks.length > 0) {
      const tl = pickTimeline(this.w.picks, this.icons, f.w - 80, TIMELINE_H, {
        current: pickAt(this.w.picks, s.tick),
        tap: (i) => this.seekTo({ tick: this.w.picks[i].tick }),
      });
      tl.position.set(f.w / 2, tlTop);
      this.view.addChild(tl);
    }
    this.view.addChild(this.controls(f.w, barY, ended));
  }

  private controls(w: number, y: number, ended: boolean): Container {
    const row = new Container();
    row.y = y;
    const s = this.game.engine.state;
    const paused = this.seek ? this.seek.paused : this.game.paused;
    const items: [string, number, () => void, number?][] = [
      [t('weekly.prevWave'), 200, () => this.seekTo({ wave: Math.max(1, s.wave - 1) })],
      [ended ? t('weekly.again') : paused ? t('weekly.play') : t('weekly.pause'), 220, () => this.toggle(ended), COLORS.saffron],
      [t('weekly.nextWave'), 200, () => this.seekTo({ wave: s.wave + 1 })],
      [t('weekly.speed', { n: this.speed }), 170, () => this.nextSpeed()],
      [t('common.back'), 190, () => this.host.back()],
    ];
    const gap = 16;
    const total = items.reduce((n, it) => n + it[1], 0) + gap * (items.length - 1);
    const k = Math.min(1, (w - 40) / total);
    let x = (w - total * k) / 2;
    for (const [text, bw, tap, fill] of items) {
      const b = button(text, bw, BAR_H - 20, tap, { fill: fill ?? COLORS.panelLocked, size: 48 });
      b.scale.set(k);
      b.x = x + (bw * k) / 2;
      x += (bw + gap) * k;
      row.addChild(b);
    }
    return row;
  }

  private toggle(ended: boolean): void {
    if (ended) return this.seekTo({ tick: 0 });
    if (this.seek) this.seek.paused = !this.seek.paused;
    else this.game.paused = !this.game.paused;
    this.relayout();
  }

  private nextSpeed(): void {
    this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
    this.game.speed = this.speed;
    this.relayout();
  }

  /** Starts a seek to `target`: from the engine in hand when it lies ahead, else from the replay's start. */
  private seekTo(target: SeekTarget): void {
    const paused = this.seek ? this.seek.paused : this.game.paused && this.game.engine.state.tick < this.end;
    const from = this.seek?.engine ?? this.game.engine;
    this.game.paused = true;
    this.seek = { target, engine: behind(from, target) ? replayEngine(this.w.replay) : from, paused };
    this.relayout();
  }

  update(): void {
    const seek = this.seek;
    if (seek && stepToward(seek.engine, seek.target, this.end)) {
      this.seek = null;
      this.game.destroy();
      this.game = this.watch(seek.engine);
      this.game.paused = seek.paused;
    }
    if (this.stateKey() !== this.shown) this.relayout();
  }

  /** What the screen shows that the run changes: the wave, the pick lit, paused, seeking, over. */
  private stateKey(): string {
    const s = this.game.engine.state;
    return `${s.wave}|${pickAt(this.w.picks, s.tick)}|${this.game.paused}|${!!this.seek}|${s.tick >= this.end}`;
  }

  /** Space plays or pauses, the arrows go a wave back or on, Escape goes back. */
  key(code: string, repeat: boolean): void {
    if (repeat) return;
    const s = this.game.engine.state;
    if (code === 'Space') this.toggle(s.tick >= this.end && !this.seek);
    else if (code === 'ArrowLeft') this.seekTo({ wave: Math.max(1, s.wave - 1) });
    else if (code === 'ArrowRight') this.seekTo({ wave: s.wave + 1 });
    else if (code === 'Escape') this.host.back();
  }

  destroy(): void {
    this.game.destroy();
    this.view.destroy({ children: true });
  }

  private relayout(): void {
    if (this.frame && !this.view.destroyed) this.layout(this.frame);
  }
}
