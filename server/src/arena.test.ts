import { describe, expect, it } from 'vitest';
import { boardId, runBoard, runScore, type BoardReply, type ReplayWire } from './protocol';
import { CURRENT_ENGINE, arenaConfig, chapterConfig, resimulate } from './resim';
import { engineFor } from './engines';
import { ResimQueue } from './resimQueue';
import { route, type Deps, type Req } from './routes';
import { checkRun } from './rules';
import { boardsOf } from './stats';
import { MemoryStore } from './store';
import { INSTALL, playArena, playChapter } from './testPlay';

// The arena's board (client meta/arena.ts): its runs, ranked by waves then time survived, on a board of their own.

const NOW = Date.parse('2026-11-18T09:30:00Z');
const ARENA = playArena();

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Req {
  return { method, path, query: new URLSearchParams(), headers, body, ip: '1.2.3.4' };
}

describe('an arena run', () => {
  it('has a board of its own per game', () => {
    expect(runBoard(ARENA.run)).toBe('arena');
    expect(runBoard({ ...ARENA.run, game: 'corgi' })).toBe('arena-corgi');
    expect(boardId(1, false, undefined, true)).toBe('arena');
    expect(runBoard(playChapter(300).run)).toBe('c1');
  });

  it('ranks by waves, then the longer survived', () => {
    const at = (wave: number, tenths: number) => runScore({ won: false, wave, tenths, arena: true });
    expect(at(12, 3000)).toBeGreaterThan(at(12, 2000));
    expect(at(13, 1000)).toBeGreaterThan(at(12, 9000));
    // a chapter loss ranks the faster run higher
    expect(runScore({ won: false, wave: 12, tenths: 3000 })).toBeLessThan(runScore({ won: false, wave: 12, tenths: 2000 }));
  });

  it('is checked as an arena run: chapter 1, normal mode, never won, past a chapter\'s waves', () => {
    const run = { ...ARENA.run, wave: 60, tenths: 60 * 60 * 10 };
    const ok = checkRun(run);
    expect(ok.ok && ok.value.arena).toBe(true);
    expect(checkRun({ ...run, chapter: 2 }).ok).toBe(false);
    expect(checkRun({ ...run, hard: true }).ok).toBe(false);
    expect(checkRun({ ...run, won: true }).ok).toBe(false);
    expect(checkRun({ ...run, arena: 'yes' }).ok).toBe(false);
    // a chapter run still stops at the chapter's waves
    expect(checkRun({ ...run, arena: undefined }).ok).toBe(false);
    const chapter = checkRun(playChapter(300).run);
    expect(chapter.ok && 'arena' in chapter.value).toBe(false);
  });

  it('must have the arena\'s config, and passes the re-simulation as played', () => {
    const { run, replay } = ARENA;
    const c = replay.config;
    expect(arenaConfig(c, run)?.arena).toBe(true);
    expect(chapterConfig(c, run)?.arena).toBe(true);
    expect(arenaConfig({ ...c, revives: 1 }, run)).toBeNull();
    expect(arenaConfig({ ...c, waves: 50 }, run)).toBeNull();
    expect(arenaConfig({ ...c, arena: undefined }, run)).toBeNull();
    expect(arenaConfig({ ...c, chapter: 2 }, run)).toBeNull();
    // an arena replay sent as a chapter run, or a chapter replay as an arena run
    expect(chapterConfig(c, { ...run, arena: undefined })).toBeNull();
    const chapter = playChapter(300);
    expect(chapterConfig(chapter.replay.config, { ...chapter.run, arena: true })).toBeNull();
    expect(resimulate(replay, run, CURRENT_ENGINE, chapterConfig).ok).toBe(true);
  });

  it('shows on the arena board once re-simulated, not on chapter 1\'s', async () => {
    const store = new MemoryStore();
    const resim = new ResimQueue(store, engineFor, () => NOW, () => {}, (fn) => setTimeout(fn, 0));
    const d: Deps = { store, tagSalt: 'salt', adminKey: 'key', now: () => NOW, allow: () => true, resim };
    const sent = await route(req('POST', '/v1/runs', { ...ARENA.run, replay: ARENA.replay as ReplayWire }), d);
    expect(sent.status).toBe(200);
    await resim.idle();
    const get = async (id: string) => (await route(req('GET', `/v1/boards/${id}`, undefined, { 'x-hk-install': INSTALL }), d)).body as BoardReply;
    const arena = await get('arena');
    expect(arena.rows.map((r) => r.wave)).toEqual([ARENA.run.wave]);
    expect((await get('c1')).rows).toHaveLength(0);
    expect((await route(req('GET', '/v1/boards/arena-corgi'), d)).status).toBe(200);
    expect((await route(req('GET', '/v1/boards/arenah'), d)).status).toBe(400);
  });

  it('counts on the dashboard apart from chapter 1', () => {
    const boards = boardsOf([
      { chapter: 1, hard: false, won: false, gaveUp: false, wave: 9, arena: true, n: 2 },
      { chapter: 1, hard: false, won: false, gaveUp: false, wave: 9, n: 1 },
    ]);
    expect(boards.map((b) => b.board).sort()).toEqual(['arena', 'c1']);
  });
});

