// The new-record cheer's timeline (drawn by recordBurstView.ts): the words pop in with an
// overshoot, gold rays turn slowly behind them, and sparks fly out from the middle, slow down
// under a little gravity and fade. Pure maths, no Pixi.

export const RECORD_BURST = {
  /** Seconds the whole cheer lasts (the wave banner around it stays as long). */
  length: 2.8,
  /** Seconds the words take to pop in, and the ease's back strength (3 swells them to 1.25). */
  pop: 0.35,
  back: 3,
  sparks: 28,
  /** Spark speed range (logical units per second), drag per second and fall (units per second²). */
  speed: [500, 1100] as const,
  drag: 2.2,
  fall: 700,
  /** Seconds a spark lives at most. */
  life: 1.6,
  /** Ray turns per second. */
  spin: 0.08,
};

/** The scale of the words `age` seconds in: 0, up past full size, back to 1. */
export function popScale(age: number): number {
  const { pop, back } = RECORD_BURST;
  if (age <= 0) return 0;
  if (age >= pop) return 1;
  // ease-out-back: a quick rise past full size, then settling on it
  const u = age / pop - 1;
  return 1 + (back + 1) * u * u * u + back * u * u;
}

/** How strongly the rays show `age` seconds in: in fast, out over the last second. */
export function rayAlpha(age: number): number {
  const { length } = RECORD_BURST;
  if (age <= 0 || age >= length) return 0;
  return Math.min(1, age / 0.2, length - age);
}

export interface Spark {
  /** Direction (radians), speed, life (seconds), size and colour slot (0..2). */
  dir: number;
  speed: number;
  life: number;
  size: number;
  hue: number;
}

/** The burst's sparks, the same every time (a fixed scatter, no randomness needed). */
export function sparks(n = RECORD_BURST.sparks): Spark[] {
  const [lo, hi] = RECORD_BURST.speed;
  const out: Spark[] = [];
  for (let i = 0; i < n; i++) {
    // golden-angle steps spread the directions evenly; the fractions scatter the rest
    const f = (i * 0.618034) % 1;
    const g = (i * 0.414214) % 1;
    out.push({
      dir: i * 2.399963,
      speed: lo + (hi - lo) * f,
      life: RECORD_BURST.life * (0.6 + 0.4 * g),
      size: 14 + 14 * ((f + g) % 1),
      hue: i % 3,
    });
  }
  return out;
}

/** Where a spark is `age` seconds in, relative to the middle, and how much of it still shows. */
export function sparkAt(s: Spark, age: number): { x: number; y: number; alpha: number } {
  if (age <= 0 || age >= s.life) return { x: 0, y: 0, alpha: 0 };
  const { drag, fall } = RECORD_BURST;
  // the speed decays as e^(-drag t); the distance flown is its integral
  const d = (s.speed * (1 - Math.exp(-drag * age))) / drag;
  return {
    x: Math.cos(s.dir) * d,
    y: Math.sin(s.dir) * d + 0.5 * fall * age * age,
    alpha: Math.min(1, (s.life - age) / 0.4),
  };
}
