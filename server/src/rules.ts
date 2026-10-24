import { CHALLENGE_ID, EVENT_NAMES, EXP_TAG, HOSTS, INTER_PLACES, LIMITS, OFFER_OUTCOMES, OFFER_PLACES, REPLAY_ENDS, RUN_BUILD, checkName, isDice, isGame, keptGame, type Game, type ChallengeRun, type ClientEvent, type EventBatch, type BoardName, type Host, type PropValue, type Report, type ReplayWire, type RunEntry, type RunReplay } from './protocol';

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

/** The game a request names, as kept (game.ts keptGame): nothing for the first game or none named, null for one unknown. */
function gameOf(v: unknown): { game?: Game } | null {
  if (v === undefined) return {};
  if (!isGame(v)) return null;
  const g = keptGame(v);
  return g ? { game: g } : {};
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

/** A `run_end`'s build fields (RUN_BUILD), where present: each must have its shape. */
export function runBuildOk(p: Record<string, PropValue>): boolean {
  const is = (k: string, ok: (x: PropValue) => boolean) => p[k] === undefined || ok(p[k]);
  return is('spells', (x) => typeof x === 'string' && RUN_BUILD.spells.test(x)) &&
    is('passives', (x) => typeof x === 'string' && RUN_BUILD.passives.test(x)) &&
    is('relicLv', (x) => isInt(x, 1, 5)) && is('awakened', (x) => typeof x === 'boolean') &&
    is('moving', (x) => isInt(x, 0, 100)) && is('travel', (x) => isInt(x, 0, RUN_BUILD.maxTravel));
}

const oneOf = (list: readonly string[]) => (x: PropValue) => typeof x === 'string' && list.includes(x);

/** The fields runWire.ts names (a run's `waves`, an offer's place and outcome, an interstitial's), where present: each must have its shape. */
export function wireOk(e: string, p: Record<string, PropValue>): boolean {
  const is = (k: string, ok: (x: PropValue) => boolean) => p[k] === undefined || ok(p[k]);
  if (e === 'run_start' || e === 'run_end') return is('waves', (x) => isInt(x, 0, LIMITS.waves));
  if (e === 'offer') return oneOf(OFFER_PLACES)(p.at) && oneOf(OFFER_OUTCOMES)(p.outcome);
  if (e === 'ad' && p.kind !== undefined) return p.kind === 'inter' && oneOf(INTER_PLACES)(p.at);
  return true;
}

function checkEvent(v: unknown, now: number): ClientEvent | null {
  if (!isObj(v) || !(EVENT_NAMES as readonly unknown[]).includes(v.e)) return null;
  if (typeof v.t !== 'number' || !Number.isFinite(v.t) || v.t < now - LIMITS.late || v.t > now + LIMITS.early) return null;
  if (v.n !== undefined && !isInt(v.n, 1, 1e9)) return null;
  const p = checkProps(v.p);
  if (p && ((v.e === 'run_end' && !runBuildOk(p)) || !wireOk(v.e as string, p))) return null;
  return p ? { e: v.e as ClientEvent['e'], t: Math.trunc(v.t), ...(v.n !== undefined ? { n: v.n } : {}), p } : null;
}

/** An analytics batch received at `now` (ms). */
export function checkBatch(v: unknown, now: number): Checked<EventBatch> {
  if (!isObj(v)) return { ok: false, reason: 'not an object' };
  if (!isId(v.install) || !isId(v.session)) return { ok: false, reason: 'bad id' };
  if (!isHost(v.host)) return { ok: false, reason: 'bad host' };
  if (!isShort(v.build, LIMITS.build) || !isShort(v.locale, LIMITS.locale)) return { ok: false, reason: 'bad build or locale' };
  const game = gameOf(v.game);
  if (!game) return { ok: false, reason: 'bad game' };
  if (!Array.isArray(v.events) || v.events.length === 0 || v.events.length > LIMITS.batchEvents) return { ok: false, reason: 'bad events' };
  if (v.exp !== undefined && !(typeof v.exp === 'string' && EXP_TAG.test(v.exp))) return { ok: false, reason: 'bad exp' };
  if (v.tester !== undefined && v.tester !== true) return { ok: false, reason: 'bad tester' };
  const tags = { ...(v.exp !== undefined && { exp: v.exp }), ...(v.tester && { tester: true as const }) };
  const events: ClientEvent[] = [];
  for (const raw of v.events) {
    const e = checkEvent(raw, now);
    if (!e) return { ok: false, reason: 'bad event' };
    events.push(e);
  }
  return { ok: true, value: { install: v.install, session: v.session, host: v.host, build: v.build, locale: v.locale, ...game, ...tags, events } };
}

/**
 * A run for the leaderboard; a run that could not have happened is refused. A won run ends on
 * the chapter's last wave; a challenge run may be won earlier (a daily's 20), which misfit
 * checks against its challenge (`anyWin`).
 */
export function checkRun(v: unknown, anyWin = false): Checked<RunEntry> {
  if (!isObj(v)) return { ok: false, reason: 'not an object' };
  if (!isId(v.install) || !isHost(v.host) || !isShort(v.build, LIMITS.build)) return { ok: false, reason: 'bad id' };
  const game = gameOf(v.game);
  if (!game) return { ok: false, reason: 'bad game' };
  if (!isInt(v.chapter, 1, LIMITS.chapters) || typeof v.hard !== 'boolean' || typeof v.won !== 'boolean') return { ok: false, reason: 'bad board' };
  if (!isInt(v.wave, 1, LIMITS.waves) || (v.won && !anyWin && v.wave !== LIMITS.waves)) return { ok: false, reason: 'bad wave' };
  if (!isInt(v.tenths, v.wave * LIMITS.minSecondsPerWave * 10, LIMITS.maxSeconds * 10)) return { ok: false, reason: 'bad time' };
  if (!isInt(v.level, 1, LIMITS.maxLevel) || !isInt(v.kills, 0, LIMITS.maxKills)) return { ok: false, reason: 'bad stats' };
  if (!isShort(v.monk, 16) || !isShort(v.relic, 16)) return { ok: false, reason: 'bad build' };
  // a name the rules refuse costs the run nothing: the board just keeps the name it had
  const name = nameOf(v.host, v.name, v.dice);
  return {
    ok: true,
    value: {
      install: v.install, host: v.host, build: v.build, ...game, chapter: v.chapter, hard: v.hard, won: v.won, wave: v.wave,
      tenths: v.tenths, level: v.level, kills: v.kills, monk: v.monk, relic: v.relic, ...(name ?? {}),
    },
  };
}

/** The hosts whose players can have an account name: CrazyGames' username, Game Center's nickname on iOS. */
const NAMING_HOSTS: readonly Host[] = ['crazygames', 'ios'];

/** A name as NameEntry allows it: an account's (NAMING_HOSTS only), else a dice name; null for neither. */
function nameOf(host: Host, name: unknown, dice: unknown): BoardName | null {
  if (typeof name === 'string') {
    const c = NAMING_HOSTS.includes(host) && name.length <= 4 * LIMITS.nameMax ? checkName(name) : null;
    return c?.ok ? { name: c.name } : null;
  }
  return isDice(dice) ? { dice } : null;
}

/** A player's name for the boards (a NameEntry). */
export function checkNameEntry(v: unknown): Checked<{ install: string; name: BoardName }> {
  if (!isObj(v) || !isId(v.install) || !isHost(v.host)) return { ok: false, reason: 'bad id' };
  const name = nameOf(v.host, v.name, v.dice);
  return name ? { ok: true, value: { install: v.install, name } } : { ok: false, reason: 'bad name' };
}

function checkReplay(v: unknown): ReplayWire | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || !isObj(v.config) || !Array.isArray(v.cmds)) return undefined;
  if (!isInt(v.engine, 0, 1e6) || !isInt(v.wave, 0, LIMITS.waves) || !isInt(v.tick, 0, LIMITS.maxSeconds * 30) || !isInt(v.hash, 0, 0xffffffff)) return undefined;
  const cmds = v.cmds as unknown[];
  if (cmds.length > LIMITS.replayNumbers || cmds.length % 5 !== 0 || !cmds.every((n) => isInt(n, -1, 1e9))) return undefined;
  if (JSON.stringify(v.config).length > LIMITS.replayConfig) return undefined;
  return { engine: v.engine, config: v.config, wave: v.wave, cmds: cmds as number[], tick: v.tick, hash: v.hash };
}

/**
 * A chapter run (RunPost) and the replay that lets the server verify it; a replay that does not
 * parse is dropped rather than refused, so the run still learns its rank.
 */
export function checkRunPost(v: unknown): Checked<{ run: RunEntry; replay: ReplayWire | null }> {
  const run = checkRun(v);
  if (!run.ok) return run;
  return { ok: true, value: { run: run.value, replay: (isObj(v) && checkReplay(v.replay)) || null } };
}

/** A challenge run: the challenge's id, a plausible run and its replay (which re-simulation checks later). */
export function checkChallengeRun(v: unknown): Checked<ChallengeRun> {
  if (!isObj(v) || typeof v.challenge !== 'string' || !CHALLENGE_ID.test(v.challenge)) return { ok: false, reason: 'bad challenge' };
  const run = checkRun(v.run, true);
  if (!run.ok) return run;
  const replay = checkReplay(v.replay);
  if (!replay) return { ok: false, reason: 'bad replay' };
  return { ok: true, value: { challenge: v.challenge, run: run.value, replay } };
}

/** A problem report: free text kept as written (the operator reads it, nothing renders it). */
export function checkReport(v: unknown): Checked<Report> {
  if (!isObj(v)) return { ok: false, reason: 'not an object' };
  if (!isId(v.install) || !isHost(v.host) || !isShort(v.build, LIMITS.build) || !isShort(v.locale, LIMITS.locale)) return { ok: false, reason: 'bad id' };
  const game = gameOf(v.game);
  if (!game) return { ok: false, reason: 'bad game' };
  if (typeof v.text !== 'string' || v.text.length > LIMITS.reportText) return { ok: false, reason: 'bad text' };
  if (typeof v.device !== 'string' || v.device.length > LIMITS.device) return { ok: false, reason: 'bad device' };
  if (!isInt(v.chapter, 0, LIMITS.chapters) || !isInt(v.wave, 0, LIMITS.waves)) return { ok: false, reason: 'bad run' };
  const replay = checkReplay(v.replay);
  if (replay === undefined) return { ok: false, reason: 'bad replay' };
  return {
    ok: true,
    value: { install: v.install, host: v.host, build: v.build, locale: v.locale, ...game, text: v.text, device: v.device, chapter: v.chapter, wave: v.wave, replay },
  };
}

/** A collected run's replay: who sent it, which run and how it ended, and the replay. */
export function checkRunReplay(v: unknown): Checked<RunReplay> {
  if (!isObj(v)) return { ok: false, reason: 'not an object' };
  if (!isId(v.install) || !isHost(v.host) || !isShort(v.build, LIMITS.build) || !isShort(v.locale, LIMITS.locale)) return { ok: false, reason: 'bad id' };
  const game = gameOf(v.game);
  if (!game) return { ok: false, reason: 'bad game' };
  if (!isId(v.run) || !(REPLAY_ENDS as readonly unknown[]).includes(v.end)) return { ok: false, reason: 'bad run' };
  const replay = checkReplay(v.replay);
  if (!replay) return { ok: false, reason: 'bad replay' };
  if (v.exp !== undefined && !(typeof v.exp === 'string' && EXP_TAG.test(v.exp))) return { ok: false, reason: 'bad exp' };
  const exp = v.exp ? { exp: v.exp } : {};
  return { ok: true, value: { install: v.install, host: v.host, build: v.build, locale: v.locale, ...game, ...exp, run: v.run, end: v.end as RunReplay['end'], replay } };
}

/** The UTC day of `ms`, as YYYY-MM-DD. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
