import type { Cue } from './cues';

// Procedural placeholder voices: every cue is a few oscillators and filtered noise bursts,
// built on the fly (the approach of D:\daydayup's platform/audioSynth.ts). Zero files and zero
// licences, so the event-to-sound pipeline is real everywhere; recorded samples can replace a
// voice later without touching anything upstream. The temple flavour comes from wood blocks,
// bells and gongs (inharmonic partials with long decays).

/** Builds one voice at `t` into `out`; every helper returns when its part ends. */
export class Kit {
  end = 0;
  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
    readonly t: number,
  ) {}

  /** A pitched note gliding to `to`, with a fast attack and an exponential decay. */
  tone(freq: number, dur: number, gain: number, o: { type?: OscillatorType; to?: number; at?: number; attack?: number } = {}): void {
    const t = this.t + (o.at ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = this.envelope(t, dur, gain, o.attack ?? 0.005);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A filtered noise burst whose cutoff can sweep to `to`. */
  noise(dur: number, gain: number, o: { cut?: number; to?: number; type?: BiquadFilterType; q?: number; at?: number; attack?: number } = {}): void {
    const t = this.t + (o.at ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.frequency.setValueAtTime(o.cut ?? 2000, t);
    if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.q !== undefined) f.Q.value = o.q;
    src.connect(f).connect(this.envelope(t, dur, gain, o.attack ?? 0.003));
    // a random slice of the shared buffer, so repeats do not sound identical
    src.start(t, Math.random() * Math.max(0, this.noiseBuf.duration - dur - 0.05), dur + 0.02);
  }

  /** A struck metal body: sine partials at `ratios` of `freq`, higher ones dying sooner. */
  metal(freq: number, ratios: readonly number[], dur: number, gain: number, at = 0): void {
    ratios.forEach((r, i) => this.tone(freq * r, dur / (1 + i * 0.6), gain / (1 + i * 0.8), { at, attack: 0.002 }));
  }

  private envelope(t: number, dur: number, gain: number, attack: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    g.connect(this.out);
    this.end = Math.max(this.end, t + dur - this.t);
    return g;
  }
}

const BELL = [1, 2.76, 5.4, 8.93];
const GONG = [1, 1.52, 2.3, 3.1, 4.2];
const WOOD = [1, 2.6];

/** One function per cue; levels here are relative, the cue table sets the mix. */
export const VOICES: Record<Cue, (k: Kit) => void> = {
  kick: (k) => {
    k.tone(170, 0.14, 1, { to: 55 });
    k.noise(0.03, 0.5, { cut: 3000 });
  },
  thump: (k) => {
    k.tone(240, 0.08, 0.8, { to: 90 });
    k.noise(0.04, 0.5, { cut: 1500 });
  },
  swish: (k) => k.noise(0.18, 0.9, { type: 'bandpass', cut: 700, to: 3500, q: 1.5, attack: 0.04 }),
  woodfish: (k) => {
    k.metal(820, WOOD, 0.12, 1);
    k.noise(0.012, 0.4, { type: 'bandpass', cut: 2500, q: 2 });
  },
  // a small singing bowl, high and quiet
  zen: (k) => k.metal(1180, BELL, 1.1, 0.5),
  hurt: (k) => {
    k.tone(320, 0.16, 0.6, { type: 'square', to: 140 });
    k.noise(0.08, 0.5, { cut: 1800 });
  },
  heroDown: (k) => {
    k.tone(440, 0.9, 0.7, { type: 'triangle', to: 110 });
    k.metal(98, GONG, 1.6, 0.6, 0.1);
  },
  revive: (k) => [523, 659, 784, 1047].forEach((f, i) => k.tone(f, 0.25, 0.6, { type: 'triangle', at: i * 0.07 })),
  hit: (k) => {
    k.noise(0.04, 0.7, { cut: 2200 });
    k.tone(300, 0.04, 0.4, { to: 180 });
  },
  crit: (k) => {
    k.noise(0.05, 0.7, { cut: 3000 });
    k.tone(1250, 0.08, 0.5, { type: 'triangle', to: 900 });
  },
  pop: (k) => {
    k.noise(0.12, 0.8, { cut: 1100, to: 300 });
    k.tone(520, 0.06, 0.3, { to: 260 });
  },
  eliteDown: (k) => {
    k.tone(130, 0.55, 1, { to: 38 });
    k.noise(0.45, 0.7, { cut: 900, to: 150 });
  },
  clang: (k) => {
    k.metal(520, [1, 2.17, 3.44], 0.4, 0.9);
    k.noise(0.02, 0.5, { type: 'highpass', cut: 3000 });
  },
  nova: (k) => {
    k.noise(0.32, 0.8, { cut: 400, to: 2800, attack: 0.05 });
    k.tone(200, 0.3, 0.7, { to: 70 });
  },
  meteor: (k) => {
    k.noise(0.4, 1, { cut: 1400, to: 120 });
    k.tone(95, 0.4, 0.9, { to: 35 });
  },
  field: (k) => {
    k.tone(880, 0.45, 0.4, { attack: 0.08 });
    k.tone(1320, 0.4, 0.25, { attack: 0.08, at: 0.05 });
  },
  zap: (k) => {
    k.tone(1300, 0.1, 0.5, { type: 'sawtooth', to: 260 });
    k.noise(0.08, 0.5, { type: 'highpass', cut: 2500 });
  },
  bloom: (k) => k.tone(620, 0.18, 0.7, { to: 990, attack: 0.02 }),
  roar: (k) => {
    k.tone(150, 0.5, 0.7, { type: 'sawtooth', to: 85, attack: 0.03 });
    k.noise(0.45, 0.7, { cut: 700, to: 250, attack: 0.03 });
  },
  bell: (k) => k.metal(660, BELL, 1.3, 0.8),
  bellBreak: (k) => {
    k.noise(0.25, 0.8, { type: 'highpass', cut: 2500 });
    k.tone(1800, 0.25, 0.4, { type: 'triangle', to: 500 });
  },
  splash: (k) => k.noise(0.32, 0.9, { cut: 3000, to: 350 }),
  howl: (k) => {
    k.tone(300, 0.35, 0.6, { type: 'triangle', to: 520, attack: 0.08 });
    k.tone(520, 0.55, 0.6, { type: 'triangle', to: 360, at: 0.3 });
  },
  summon: (k) => {
    k.tone(200, 0.45, 0.5, { to: 600, attack: 0.1 });
    k.tone(212, 0.45, 0.4, { to: 630, attack: 0.1 });
  },
  bossCast: (k) => {
    k.tone(220, 0.28, 0.6, { type: 'sawtooth', to: 440 });
    k.noise(0.2, 0.4, { type: 'bandpass', cut: 1200, q: 2 });
  },
  windup: (k) => k.tone(80, 0.6, 0.7, { type: 'sawtooth', to: 300, attack: 0.5 }),
  slam: (k) => {
    k.tone(95, 0.65, 1, { to: 30 });
    k.noise(0.55, 0.9, { cut: 600, to: 100 });
  },
  bossDown: (k) => {
    k.tone(90, 0.9, 1, { to: 28 });
    k.noise(0.8, 0.8, { cut: 800, to: 100 });
    k.metal(82, GONG, 2.4, 0.7, 0.15);
  },
  blast: (k) => {
    k.noise(0.25, 0.8, { cut: 900, to: 200 });
    k.tone(110, 0.2, 0.6, { to: 50 });
  },
  gem: (k) => k.tone(1300, 0.07, 0.6, { to: 1750 }),
  levelUp: (k) => [523, 659, 784, 1047].forEach((f, i) => k.tone(f, 0.3, 0.6, { type: 'triangle', at: i * 0.06 })),
  pick: (k) => {
    k.tone(784, 0.14, 0.6, { type: 'triangle', to: 1175 });
    k.metal(1568, [1], 0.4, 0.25, 0.05);
  },
  wave: (k) => k.metal(110, GONG, 1.8, 0.8),
  cleared: (k) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => k.tone(f, 0.4, 0.55, { type: 'triangle', at: i * 0.09 }));
    k.metal(110, GONG, 2.4, 0.7, 0.45);
  },
  tap: (k) => k.metal(1400, WOOD, 0.05, 0.7),
};

/** One second of white noise, made once per context and sliced by every burst. */
export function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
