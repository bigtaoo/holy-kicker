import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@hk/protocol';
import { checkReplay, DEFAULT_RUN, Engine, quantizeMove, type LocalInputSource } from '@hk/engine';
import type { Game } from '../game/Game';
import { DEFAULT_SCENE } from '../game/scene';
import type { Backend, ReportDraft } from '../net/backend';
import type { Platform, TextAsk } from '../platform/types';
import { canReport, draftReport, reportProblem } from './problemReport';

// The pause panel's problem report: what goes into it, and what each answer of the text box does.

const CHAPTER = { ...DEFAULT_RUN, seed: 77, waves: 50, threats: true };

/** A run played for `ticks` with the stick turning now and then; only its engine is read. */
function played(ticks: number, config = CHAPTER): Game {
  const engine = new Engine(config);
  for (let t = 1; t <= ticks; t++) {
    engine.submit({ owner: 0, tick: t, ...quantizeMove(Math.cos(t >> 5), Math.sin(t >> 4)) });
    engine.advance();
  }
  return { engine } as unknown as Game;
}

function host(answer: string | null): Platform & { asked: TextAsk[] } {
  const asked: TextAsk[] = [];
  return {
    asked,
    askText: async (o: TextAsk) => {
      asked.push(o);
      return answer;
    },
    device: () => 'Test phone',
  } as unknown as Platform & { asked: TextAsk[] };
}

function backend(online: boolean, ok = true): Backend & { sent: ReportDraft[] } {
  const sent: ReportDraft[] = [];
  return {
    sent,
    online,
    report: async (d: ReportDraft) => {
      sent.push(d);
      return ok;
    },
  } as unknown as Backend & { sent: ReportDraft[] };
}

afterEach(() => vi.unstubAllGlobals());

describe('draftReport', () => {
  it('carries the note, the device, where the run is and a replay that plays back', () => {
    const game = played(600);
    const d = draftReport(game, DEFAULT_SCENE, 'stuck', 'Test phone');
    expect(d).toMatchObject({ text: 'stuck', device: 'Test phone', chapter: CHAPTER.chapter, wave: game.engine.state.wave });
    expect(d.replay).not.toBeNull();
    expect(d.replay!.wave).toBe(1);
    expect(d.replay!.tick).toBe(600);
    expect(checkReplay(JSON.parse(JSON.stringify(d.replay)))).toBe(true);
  });

  it('copies the config, so the run going on does not change what was sent', () => {
    const game = played(30);
    const d = draftReport(game, DEFAULT_SCENE, '', '');
    expect(d.replay!.config).toEqual(game.engine.state.config);
    expect(d.replay!.config).not.toBe(game.engine.state.config);
  });

  it('keeps a dev start wave, but not in the sandbox or past the last wave', () => {
    const game = played(10);
    expect(draftReport(game, { ...DEFAULT_SCENE, wave: 20 }, '', '').replay!.wave).toBe(20);
    expect(draftReport(game, { ...DEFAULT_SCENE, wave: 99 }, '', '').replay!.wave).toBe(CHAPTER.waves);
    const sandbox = played(10, { ...CHAPTER, waves: 0 });
    expect(draftReport(sandbox, { ...DEFAULT_SCENE, wave: 20 }, '', '').replay!.wave).toBe(1);
  });

  it('sends the note alone when the replay is too long for the wire', () => {
    const game = played(5);
    const history = (game.engine.input as LocalInputSource).history;
    // every command a new move, so none is packed away
    for (let i = 0; i < LIMITS.replayNumbers / 5 + 1; i++) history.push({ owner: 0, tick: 1, moveBrad: i % 65536, moveMag: 255 });
    const d = draftReport(game, DEFAULT_SCENE, 'long run', '');
    expect(d.replay).toBeNull();
    expect(d.text).toBe('long run');
  });
});

describe('reportProblem', () => {
  it('asks in the current language, with the server\'s length cap', async () => {
    const p = host(null);
    await reportProblem(p, backend(true), () => played(1), DEFAULT_SCENE);
    expect(p.asked).toHaveLength(1);
    expect(p.asked[0].max).toBe(LIMITS.reportText);
    expect(p.asked[0].title).not.toBe('report.title');
  });

  it('sends nothing when the player cancels or the run is gone', async () => {
    const net = backend(true);
    expect(await reportProblem(host(null), net, () => played(1), DEFAULT_SCENE)).toBe('cancelled');
    expect(await reportProblem(host('hi'), net, () => null, DEFAULT_SCENE)).toBe('cancelled');
    expect(net.sent).toHaveLength(0);
  });

  it('says whether the server kept it', async () => {
    const net = backend(true);
    expect(await reportProblem(host('boss stuck'), net, () => played(60), DEFAULT_SCENE)).toBe('sent');
    expect(net.sent[0]).toMatchObject({ text: 'boss stuck', device: 'Test phone' });
    expect(await reportProblem(host('x'), backend(true, false), () => played(1), DEFAULT_SCENE)).toBe('failed');
  });

  it('saves a file instead when offline in development', async () => {
    const clicked: string[] = [];
    vi.stubGlobal('document', { createElement: () => ({ click(this: { download: string }) { clicked.push(this.download); } }) });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    const net = backend(false);
    expect(await reportProblem(host('offline'), net, () => played(1), DEFAULT_SCENE)).toBe('sent');
    expect(net.sent).toHaveLength(0);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]).toMatch(/^report-.+\.json$/);
  });
});

describe('canReport', () => {
  it('offers a report online, and offline only in a development browser', () => {
    expect(canReport(backend(true), false)).toBe(true);
    expect(canReport(backend(false), false)).toBe(false);
    // vitest runs in node: no document, so a dev build there has nowhere to save a file
    expect(canReport(backend(false), true)).toBe(false);
    vi.stubGlobal('document', {});
    expect(canReport(backend(false), true)).toBe(true);
  });
});
