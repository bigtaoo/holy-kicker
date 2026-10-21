import { describe, expect, it } from 'vitest';
import { piecesFor, piecesKept } from './chapterNeeds';

const sorted = (s: Set<string>) => [...s].sort();

describe('piecesFor', () => {
  it("draws each chapter's horde from its chapter on, and a boss in its chapter and the next", () => {
    expect(sorted(piecesFor(0))).toEqual([]);
    expect(sorted(piecesFor(1))).toEqual([]);
    expect(sorted(piecesFor(2))).toEqual(['carp', 'marsh']);
    expect(sorted(piecesFor(3))).toEqual(['carp', 'marsh', 'snow', 'witch']);
    expect(sorted(piecesFor(4))).toEqual(['ghost', 'judge', 'marsh', 'snow', 'witch']);
    expect(sorted(piecesFor(5))).toEqual(['ghost', 'judge', 'marsh', 'peak', 'snow']);
  });

  it("draws a later chapter by its map, with the Inner Demon as the temple map's mid-boss", () => {
    expect(sorted(piecesFor(6))).toEqual(['marsh', 'peak']);
    expect(sorted(piecesFor(7))).toEqual(['carp', 'marsh', 'snow']);
  });

  it("adds the next map's horde from act 2, the shards from act 3 and the rush's bosses in act 4", () => {
    expect(sorted(piecesFor(11))).toEqual(['marsh', 'peak', 'snow']);
    expect(sorted(piecesFor(16))).toEqual(['carp', 'marsh', 'peak', 'snow']);
    expect(sorted(piecesFor(20))).toEqual(['carp', 'ghost', 'judge', 'marsh', 'peak', 'snow', 'witch']);
  });
});

describe('piecesKept', () => {
  it("keeps the next chapter's too, so the lobby's fetch ahead is not thrown away", () => {
    expect(sorted(piecesKept(1))).toEqual(['carp', 'marsh']);
    expect(sorted(piecesKept(5))).toEqual(['ghost', 'judge', 'marsh', 'peak', 'snow']);
    expect(sorted(piecesKept(20))).toEqual(sorted(piecesFor(20)));
  });
});
