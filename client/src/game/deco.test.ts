import { describe, expect, it } from 'vitest';
import { DECO, scatterDeco, type DecoKind } from './deco';

const KINDS: DecoKind[] = [
  { name: 'tuft', weight: 3, size: 90 },
  { name: 'rock', weight: 1, size: 110 },
];

describe('scatterDeco', () => {
  const items = scatterDeco(KINDS);
  const props = items.filter((d) => d.kind >= 0);
  const patches = items.filter((d) => d.kind < 0);

  it('is the same field for the same seed', () => {
    expect(scatterDeco(KINDS)).toEqual(items);
    expect(scatterDeco(KINDS, DECO, 8)).not.toEqual(items);
  });

  it('puts patches below the props', () => {
    expect(items.findIndex((d) => d.kind >= 0)).toBe(patches.length);
  });

  it('fills about the asked share of cells, by weight, and stays in the field', () => {
    const cells = (2 * DECO.field / DECO.cell) ** 2;
    expect(props.length / cells).toBeGreaterThan(DECO.fill - 0.08);
    expect(props.length / cells).toBeLessThan(DECO.fill + 0.08);
    const tufts = props.filter((d) => d.kind === 0).length / props.length;
    expect(tufts).toBeGreaterThan(0.65);
    expect(tufts).toBeLessThan(0.85);
    for (const d of items) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(DECO.field + DECO.patchCell);
      expect(Math.abs(d.y)).toBeLessThanOrEqual(DECO.field + DECO.patchCell);
    }
  });

  it('keeps the start clear of props', () => {
    expect(props.every((d) => Math.hypot(d.x, d.y) >= 250)).toBe(true);
  });

  it('scales sizes around the kind size', () => {
    for (const d of props) {
      expect(d.size / KINDS[d.kind].size).toBeGreaterThanOrEqual(0.8);
      expect(d.size / KINDS[d.kind].size).toBeLessThanOrEqual(1.2);
    }
  });

  it('gives only patches without kinds', () => {
    expect(scatterDeco([]).every((d) => d.kind < 0)).toBe(true);
  });
});
