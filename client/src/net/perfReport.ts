import { TICK_RATE, type SimState } from '@hk/engine';
import { perfTrouble, type PerfProps, type PropValue, type SessionDeviceProps } from '@hk/protocol';
import type { Application, TextureSource } from 'pixi.js';
import { countNodes, textureStats, type MemSample } from '../game/memProbe';
import type { BattleFrame } from '../game/frameWork';
import { CTX_BOSS, CTX_WAVE, gpuClass, PerfMeter, type PerfSnapshot } from '../game/perfMeter';
import type { DeviceInfo } from '../game/quality';
import type { Backend } from './backend';

// The `perf` event's sender (server/src/protocol.ts PerfProps): one meter per real run, fed the
// battle frames, snapshotted as the run ends and as the game goes to the background mid-run.
// Every few battle minutes it looks at a `mid` snapshot too, but sends it only when something
// looks wrong (perfTrouble); a healthy stretch is folded into the next snapshot, which keeps the
// player's data down to about one small event a run. Dev sandboxes and bot runs get no meter,
// so they send nothing.

/** Mobs and elites standing; a downed mob resting at health 0 for the next wave is not. */
export function liveMobs(s: SimState): number {
  let n = s.elites.length;
  for (const m of s.mobs) if (m.hp > 0) n++;
  return n;
}

/** A wave's first seconds, while its opening spawns pour in. */
const WAVE_START_TICKS = 3 * TICK_RATE;

/** What a hitch happened during (perfMeter CTX_ bits): a boss or elite standing, a wave just begun. */
export function hitchContext(s: SimState): number {
  return (s.boss || s.elites.length ? CTX_BOSS : 0) | (s.wave > 0 && s.waveT < WAVE_START_TICKS ? CTX_WAVE : 0);
}

/** Chrome's JS heap in MB; undefined where the host has no performance.memory (WeChat, Safari, Firefox). */
function heapMB(): number | undefined {
  const mem = (globalThis as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance?.memory;
  const used = mem?.usedJSHeapSize;
  return typeof used === 'number' && used > 0 ? Math.round(used / 2 ** 20) : undefined;
}

/** Reads what the game holds now: the stage's display objects, the renderer's textures, the heap. */
export function memProbe(app: Application): () => MemSample {
  return () => {
    const sources = (app.renderer as { texture?: { managedTextures?: readonly (TextureSource | null)[] } }).texture?.managedTextures ?? [];
    const sample: MemSample = { ...textureStats(sources), nodes: countNodes(app.stage) };
    const heap = heapMB();
    if (heap !== undefined) sample.heap = heap;
    return sample;
  };
}

/** The device fields `session` carries once per launch, so no `perf` repeats them. */
export function sessionDevice(d: DeviceInfo): SessionDeviceProps & Record<string, PropValue> {
  return { mem: d.memoryGB || 0, cores: d.cores || 0, gpu: gpuClass(d.gpu) };
}

export class PerfReport {
  private meter: PerfMeter | null = null;
  /** Runs started since launch. */
  private nth = 0;
  /** What the game held at the run's first battle frame, once its scene is built. */
  private base: MemSample | null = null;

  constructor(
    private readonly net: Backend,
    private readonly probe: () => MemSample,
  ) {
    net.onHidden(() => this.send('leave'));
  }

  /** A run starts; `measured` is false for a dev sandbox or bot run. */
  start(measured: boolean): void {
    this.nth++;
    this.meter = measured ? new PerfMeter() : null;
    this.base = null;
  }

  frame(f: BattleFrame, mobs: number, ctx = 0): void {
    if (!this.meter) return;
    this.base ??= this.probe();
    this.meter.frame(f, mobs, ctx);
    if (!this.meter.midDue()) return;
    const props = this.props(this.meter.snapshot('mid', true));
    if (props && perfTrouble(props)) {
      this.meter.reset();
      this.track(props);
    }
  }

  /** The run ended: its last snapshot, and no more until the next run starts. */
  end(): void {
    this.send('end');
    this.meter = null;
  }

  private send(why: PerfSnapshot['why']): void {
    const props = this.props(this.meter?.snapshot(why) ?? null);
    if (props) this.track(props);
  }

  private props(snap: PerfSnapshot | null): PerfProps | null {
    if (!snap || !this.base) return null;
    const now = this.probe();
    const base = this.base;
    const props: PerfProps = { ...snap, nth: this.nth, tex: now.tex, texUp: now.tex - base.tex, texMB: now.texMB, nodes: now.nodes, nodesUp: now.nodes - base.nodes };
    if (now.heap !== undefined) {
      props.heap = now.heap;
      if (base.heap !== undefined) props.heapUp = now.heap - base.heap;
    }
    return props;
  }

  private track(props: PerfProps): void {
    this.net.track('perf', props as unknown as Record<string, PropValue>);
  }
}
