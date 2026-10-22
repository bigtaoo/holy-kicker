import type { SimEvent, SimState } from '@hk/engine';

// What a replay shows beyond the run's end row: where the time went, how the horde stood
// around the hero (spread out, or herded into one clump), how the stick was played (still,
// running straight, circling), what hurt and what killed, and which cards were offered and
// taken. It only reads the state and events of an engine stepping the replay, so the same code
// reads a replay on the engine version it was recorded with (build/replays.mjs bundles it with
// that version's engine/). Old engines lack some fields; those come out as 'unknown'.

/** The part of Engine this needs; an older engine has the same shape. */
export interface Stepper {
  readonly state: SimState;
  advance(): readonly SimEvent[] | null;
}

const TICK_RATE = 30;
const FP = 1000;
/** Half the visible world around the hero on a 9:16 phone (engine VIEW), world units. */
const VIEW_W = 480;
const VIEW_H = 680;
/** Mobs this close press on the hero; within RING they count toward surrounding him. */
const NEAR = 250;
const RING = 400;
/** The clump patch: the busiest square of this side, as a share of the mobs on screen. */
const PATCH = 400;
/** Sampling the horde every this many ticks (a third of a second). */
const SAMPLE = 10;
/** Stick windows, for circling: one counts as circling when the stick turned a full circle one way. */
const WINDOW = 10 * TICK_RATE;
/** The last seconds before a death whose damage is broken down. */
const LAST = 5 * TICK_RATE;
/** Low health, percent of the max. */
const LOW = 25;

export interface WaveStats {
  wave: number;
  /** Seconds into the run it began, and seconds it lasted (pick menus included). */
  at: number;
  seconds: number;
  kills: number;
  damage: number;
  /** Health at its end and its lowest, percent of max. */
  hpEnd: number;
  hpMin: number;
  level: number;
  /** Averages over the wave's samples. */
  onScreen: number;
  near: number;
  /** Percent of the on-screen horde in the busiest PATCH square (about 12 % if spread evenly). */
  clump: number;
  /** Eighths of the circle around the hero (within RING) holding a mob. */
  sectors: number;
}

export interface Death {
  at: number;
  wave: number;
  /** What dealt the last blow, and the damage by source over the LAST seconds before. */
  blow: string;
  last: Record<string, number>;
  near: number;
  sectors: number;
  /** Percent of the last LAST ticks the hero was moving. */
  moving: number;
}

export interface PickStats {
  at: number;
  wave: number;
  level: number;
  offered: string[];
  took: string;
}

/** The hero's final build: spells and passives with their levels, the relic's. */
export interface BuildStats {
  relic: string;
  relicLv: number;
  awakened: boolean;
  spells: { id: string; level: number; evolved: boolean }[];
  passives: { id: string; level: number }[];
}

export interface RunStats {
  ticks: number;
  seconds: number;
  outcome: string;
  wave: number;
  level: number;
  kills: number;
  /** Seconds down waiting on a revive (pick menus pause the client, so they take no ticks). */
  downSeconds: number;
  revives: number;
  damage: Record<string, number>;
  /** Percent of live play with the stick let go, and with health under LOW of the max. */
  idle: number;
  low: number;
  /** Percent of WINDOW stretches in which the stick turned a full circle one way. */
  circling: number;
  /** Percent of moving samples with most on-screen mobs behind the hero (being led, not met). */
  leading: number;
  waves: WaveStats[];
  deaths: Death[];
  picks: PickStats[];
  build: BuildStats;
}

interface WaveAcc {
  wave: number; from: number; kills: number; damage: number; hpMin: number; samples: number;
  onScreen: number; near: number; clump: number; sectors: number;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const cardName = (c: { kind: string; id: string }) => `${c.kind}:${c.id}`;

/** How the live mobs stand around the hero at (hx, hy) (FP): counts on screen, near, clumping, sectors, behind. */
export function hordeAround(s: SimState, hx: number, hy: number, vx: number, vy: number) {
  let onScreen = 0, near = 0, behind = 0;
  const cells = new Map<number, number>();
  let sectorMask = 0;
  const speed = Math.sqrt(vx * vx + vy * vy);
  const consider = (x: number, y: number) => {
    const dx = (x - hx) / FP, dy = (y - hy) / FP;
    if (Math.abs(dx) > VIEW_W || Math.abs(dy) > VIEW_H) return;
    onScreen++;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= NEAR) near++;
    if (d <= RING) sectorMask |= 1 << (Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8) & 7);
    if (speed > 0 && dx * vx + dy * vy < 0) behind++;
    const key = Math.floor((dx + VIEW_W) / (PATCH / 2)) * 64 + Math.floor((dy + VIEW_H) / (PATCH / 2));
    cells.set(key, (cells.get(key) ?? 0) + 1);
  };
  for (const m of s.mobs) if (m.hp > 0 && !(m.kind === 'emerger' && m.t > 0)) consider(m.x, m.y);
  for (const e of s.elites) consider(e.x, e.y);
  // the busiest PATCH square: the best 2 x 2 block of half-patch cells
  let best = 0;
  for (const [key, n] of cells) {
    const sum = n + (cells.get(key + 1) ?? 0) + (cells.get(key + 64) ?? 0) + (cells.get(key + 65) ?? 0);
    if (sum > best) best = sum;
  }
  let sectors = 0;
  for (let i = 0; i < 8; i++) if (sectorMask & (1 << i)) sectors++;
  return { onScreen, near, clump: pct(best, onScreen), sectors, behind };
}

/** Steps `engine` to `endTick` (the replay's last) and reads the run off it. */
export function analyzeRun(engine: Stepper, endTick: number): RunStats {
  const s = engine.state;
  const out: RunStats = {
    ticks: 0, seconds: 0, outcome: '', wave: 0, level: 1, kills: 0, downSeconds: 0, revives: 0, damage: {},
    idle: 0, low: 0, circling: 0, leading: 0, waves: [], deaths: [], picks: [],
    build: { relic: '', relicLv: 1, awakened: false, spells: [], passives: [] },
  };
  let downTicks = 0, liveTicks = 0, idleTicks = 0, lowTicks = 0, movingSamples = 0, ledSamples = 0;
  let windows = 0, circlingWindows = 0, windowTurn = 0, windowT = 0, lastBrad = -1;
  let acc: WaveAcc | null = null;
  const hurtLog: { t: number; src: string; v: number }[] = [];
  const movedLog: boolean[] = [];
  let open: PickStats | null = null;

  const closeWave = () => {
    if (!acc) return;
    const p = s.players[0];
    const n = Math.max(1, acc.samples);
    out.waves.push({
      wave: acc.wave, at: r1(acc.from / TICK_RATE), seconds: r1((s.tick - acc.from) / TICK_RATE), kills: acc.kills, damage: acc.damage,
      hpEnd: pct(p.hp, p.maxHp), hpMin: acc.hpMin, level: p.level, onScreen: Math.round(acc.onScreen / n), near: r1(acc.near / n),
      clump: Math.round(acc.clump / n), sectors: r1(acc.sectors / n),
    });
  };
  const newWave = () => {
    closeWave();
    acc = { wave: s.wave, from: s.tick, kills: 0, damage: 0, hpMin: 100, samples: 0, onScreen: 0, near: 0, clump: 0, sectors: 0 };
  };
  newWave();

  while (s.tick < endTick) {
    const events = engine.advance();
    if (!events) break;
    const p = s.players[0];
    if (s.wave !== acc!.wave) newWave();
    const a = acc!;
    const menu = s.players.some((q) => q.offer.length > 0);
    for (const ev of events) {
      if (ev.type === 'mobDown' || ev.type === 'eliteDown' || ev.type === 'bossDown') { a.kills++; out.kills++; }
      else if (ev.type === 'hurt' && ev.value > 0) {
        const src = (ev as { src?: string }).src ?? 'unknown';
        out.damage[src] = (out.damage[src] ?? 0) + ev.value;
        a.damage += ev.value;
        hurtLog.push({ t: s.tick, src, v: ev.value });
      } else if (ev.type === 'heroDown') {
        const recent = hurtLog.filter((h) => h.t > s.tick - LAST);
        const last: Record<string, number> = {};
        for (const h of recent) last[h.src] = (last[h.src] ?? 0) + h.v;
        const around = hordeAround(s, p.x, p.y, 0, 0);
        const moved = movedLog.slice(-LAST);
        out.deaths.push({
          at: r1(s.tick / TICK_RATE), wave: s.wave, blow: recent.at(-1)?.src ?? 'unknown', last, near: around.near,
          sectors: around.sectors, moving: pct(moved.filter(Boolean).length, moved.length),
        });
      } else if (ev.type === 'revive') out.revives++;
      else if (ev.type === 'pick' && open) {
        open.took = `${ev.kind}:${ev.id}`;
        out.picks.push(open);
        open = null;
      }
    }
    if (menu && !open) open = { at: r1(s.tick / TICK_RATE), wave: s.wave, level: p.level, offered: p.offer.map(cardName), took: '' };
    if (p.maxHp > 0) a.hpMin = Math.min(a.hpMin, pct(p.hp, p.maxHp));
    if (menu) continue;
    if (p.dead) { downTicks++; continue; }
    if (s.outcome !== 'playing') continue;
    liveTicks++;
    const moving = p.moveMag > 0;
    movedLog.push(moving);
    if (movedLog.length > LAST) movedLog.shift();
    if (!moving) idleTicks++;
    if (p.hp * 100 < p.maxHp * LOW) lowTicks++;
    // the stick's turning, one way or the other, over each WINDOW
    if (moving && lastBrad >= 0) {
      let d = (p.moveBrad - lastBrad) & 65535;
      if (d >= 32768) d -= 65536;
      windowTurn += d;
    }
    lastBrad = moving ? p.moveBrad : -1;
    if (++windowT === WINDOW) {
      windows++;
      if (Math.abs(windowTurn) >= 65536) circlingWindows++;
      windowT = 0;
      windowTurn = 0;
    }
    if (s.tick % SAMPLE === 0) {
      const h = hordeAround(s, p.x, p.y, p.x - p.px, p.y - p.py);
      a.samples++;
      a.onScreen += h.onScreen;
      a.near += h.near;
      a.clump += h.clump;
      a.sectors += h.sectors;
      if (moving && h.onScreen >= 10) {
        movingSamples++;
        if (h.behind * 2 > h.onScreen) ledSamples++;
      }
    }
  }
  closeWave();
  const p = s.players[0];
  Object.assign(out, {
    ticks: s.tick, seconds: r1(s.tick / TICK_RATE), outcome: s.outcome, wave: s.wave, level: p.level,
    downSeconds: r1(downTicks / TICK_RATE), idle: pct(idleTicks, liveTicks), low: pct(lowTicks, liveTicks),
    circling: pct(circlingWindows, windows), leading: pct(ledSamples, movingSamples),
    build: {
      relic: p.relicId, relicLv: p.relic, awakened: p.awakened,
      spells: p.spells.map((sp) => ({ id: sp.id, level: sp.level, evolved: sp.evolved })),
      passives: p.passives.map((ps) => ({ id: ps.id, level: ps.level })),
    },
  });
  return out;
}
