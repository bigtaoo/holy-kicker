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
});

describe('piecesKept', () => {
  it("keeps the next chapter's too, so the lobby's fetch ahead is not thrown away", () => {
    expect(sorted(piecesKept(1))).toEqual(['carp', 'marsh']);
    expect(sorted(piecesKept(5))).toEqual(['ghost', 'judge', 'marsh', 'peak', 'snow']);
  });
});
