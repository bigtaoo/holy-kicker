// The kill cam: when the hero goes down, the view runs in slow motion for about three seconds while
// the camera eases in toward the point between him and the blow that felled him, so the player
// sees what killed him before the death panel opens. The sim has already stopped (the run is
// lost); only the view's time slows. Pure timeline maths, used by killCamView.ts.

export const KILL_CAM = {
  /** View time per real time while the cam runs. */
  scale: 0.25,
  /** Real seconds to ease in, to hold, and to ease back out. */
  easeIn: 0.4,
  hold: 2.2,
  easeOut: 0.4,
  /** Camera zoom at the hold. */
  zoom: 1.25,
  /** World units the blow's source counts at most away from the hero, so he stays in view. */
  reach: 400,
  /** Highlight pulses per real second. */
  pulse: 3,
};

export type KillCamPhase = 'idle' | 'in' | 'hold' | 'out';

export interface KillCamShot {
  phase: KillCamPhase;
  /** View time per real time this frame (1 when idle). */
  scale: number;
  zoom: number;
  /** How far the camera has moved from its usual point toward the focus, 0..1. */
  mix: number;
  /** The highlight's pulse, 0..1. */
  pulse: number;
}

export const IDLE_SHOT: KillCamShot = { phase: 'idle', scale: 1, zoom: 1, mix: 0, pulse: 0 };

/** Real seconds the whole cam lasts. */
export function killCamLength(): number {
  return KILL_CAM.easeIn + KILL_CAM.hold + KILL_CAM.easeOut;
}

function smooth(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
}

/** The shot `t` real seconds after the hero went down. */
export function shotAt(t: number): KillCamShot {
  if (t < 0 || t >= killCamLength()) return IDLE_SHOT;
  const { easeIn, hold } = KILL_CAM;
  const phase: KillCamPhase = t < easeIn ? 'in' : t < easeIn + hold ? 'hold' : 'out';
  const mix = phase === 'in' ? smooth(t / easeIn) : phase === 'hold' ? 1 : 1 - smooth((t - easeIn - hold) / KILL_CAM.easeOut);
  const pulse = 0.5 - 0.5 * Math.cos(t * KILL_CAM.pulse * Math.PI * 2);
  return { phase, scale: KILL_CAM.scale, zoom: 1 + (KILL_CAM.zoom - 1) * mix, mix, pulse };
}

/** The point the cam eases toward: halfway from the hero to the source, the source clamped to `reach`. */
export function focusPoint(hx: number, hy: number, sx: number, sy: number, reach = KILL_CAM.reach): { x: number; y: number } {
  const dx = sx - hx;
  const dy = sy - hy;
  const d = Math.hypot(dx, dy);
  const k = d > reach ? reach / d : 1;
  return { x: hx + (dx * k) / 2, y: hy + (dy * k) / 2 };
}

/** The kill cam's clock: started when the hero goes down, idle again once it has played. */
export class KillCam {
  private t = -1;

  get busy(): boolean {
    return this.t >= 0;
  }

  start(): void {
    this.t = 0;
  }

  stop(): void {
    this.t = -1;
  }

  /** Advances by `dt` real seconds; the shot now. */
  step(dt: number): KillCamShot {
    if (this.t < 0) return IDLE_SHOT;
    this.t += dt;
    const shot = shotAt(this.t);
    if (shot.phase === 'idle') this.t = -1;
    return shot;
  }
}

/** Each channel of two 0xRRGGBB colours multiplied, as a tint multiplies. */
export function mulColor(a: number, b: number): number {
  let out = 0;
  for (const s of [16, 8, 0]) out |= Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
  return out;
}

/** `a` blended `k` (0..1) of the way to `b`, per channel. */
export function mixColor(a: number, b: number, k: number): number {
  let out = 0;
  for (const s of [16, 8, 0]) {
    const ca = (a >> s) & 255;
    out |= Math.round(ca + (((b >> s) & 255) - ca) * k) << s;
  }
  return out;
}
