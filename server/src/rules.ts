import { EVENT_NAMES, HOSTS, LIMITS, type ClientEvent, type EventBatch, type Host, type PropValue, type RunEntry } from './protocol';

// Checks what clients send before anything is stored. Pure: each check takes the parsed JSON
// (unknown) and returns the clean value or the reason it was refused. Anything unexpected is
// refused whole rather than trimmed, so a broken or hostile client is visible in the logs.

export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

const ID = /^[A-Za-z0-9_-]+$/;
const SHORT = /^[A-Za-z0-9_.+-]*$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length >= LIMITS.idMin && v.length <= LIMITS.idMax && ID.test(v);
}

function isShort(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max && SHORT.test(v);
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function isHost(v: unknown): v is Host {
  return typeof v === 'string' && (HOSTS as readonly string[]).includes(v);
}

function checkProps(v: unknown): Record<string, PropValue> | null {
  if (v === undefined) return {};
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (keys.length > LIMITS.props) return null;
  const out: Record<string, PropValue> = {};
  for (const k of keys) {
    const x = v[k];
    if (k.length > LIMITS.propKey || !ID.test(k)) return null;
    if (typeof x === 'string' ? x.length > LIMITS.propString : typeof x === 'number' ? !Number.isFinite(x) : typeof x !== 'boolean') return null;
    out[k] = x as PropValue;
  }
  return out;
}

function checkEvent(v: unknown, now: number): ClientEvent | null {
  if (!isObj(v) || !(EVENT_NAMES as readonly unknown[]).includes(v.e)) return null;
  if (typeof v.t !== 'number' || !Number.isFinite(v.t) || v.t < now - LIMITS.late || v.t > now + LIMITS.early) return null;
  const p = checkProps(v.p);
  return p ? { e: v.e as ClientEvent['e'], t: Math.trunc(v.t), p } : null;
}

/** An analytics batch received at `now` (ms). */
export function checkBatch(v: unknown, now: number): Checked<EventBatch> {
  if (!isObj(v)) return { ok: false, reason: 'not an object' };
  if (!isId(v.install) || !isId(v.session)) return { ok: false, reason: 'bad id' };
  if (!isHost(v.host)) return { ok: false, reason: 'bad host' };
  if (!isShort(v.build, LIMITS.build) || !isShort(v.locale, LIMITS.locale)) return { ok: false, reason: 'bad build or locale' };
  if (!Array.isArray(v.events) || v.events.length === 0 || v.events.length > LIMITS.batchEvents) return { ok: false, reason: 'bad events' };
  const events: ClientEvent[] = [];
  for (const raw of v.events) {
    const e = checkEvent(raw, now);
    if (!e) return { ok: false, reason: 'bad event' };
    events.push(e);
  }
  return { ok: true, value: { install: v.install, session: v.session, host: v.host, build: v.build, locale: v.locale, events } };
}

/** A run for the leaderboard; a run that could not have happened is refused. */
export function checkRun(v: unknown): Checked<RunEntry> {
  if (!isObj(v)) return { ok: false, reason: 'not an object' };
  if (!isId(v.install) || !isHost(v.host) || !isShort(v.build, LIMITS.build)) return { ok: false, reason: 'bad id' };
  if (!isInt(v.chapter, 1, LIMITS.chapters) || typeof v.hard !== 'boolean' || typeof v.won !== 'boolean') return { ok: false, reason: 'bad board' };
  if (!isInt(v.wave, 1, LIMITS.waves) || (v.won && v.wave !== LIMITS.waves)) return { ok: false, reason: 'bad wave' };
  if (!isInt(v.tenths, v.wave * LIMITS.minSecondsPerWave * 10, LIMITS.maxSeconds * 10)) return { ok: false, reason: 'bad time' };
  if (!isInt(v.level, 1, LIMITS.maxLevel) || !isInt(v.kills, 0, LIMITS.maxKills)) return { ok: false, reason: 'bad stats' };
  if (!isShort(v.monk, 16) || !isShort(v.relic, 16)) return { ok: false, reason: 'bad build' };
  return {
    ok: true,
    value: {
      install: v.install, host: v.host, build: v.build, chapter: v.chapter, hard: v.hard, won: v.won, wave: v.wave,
      tenths: v.tenths, level: v.level, kills: v.kills, monk: v.monk, relic: v.relic,
    },
  };
}

/** The UTC day of `ms`, as YYYY-MM-DD. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
