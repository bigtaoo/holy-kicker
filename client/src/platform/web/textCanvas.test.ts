import { describe, expect, it } from 'vitest';
import type { Adapter, ICanvas } from 'pixi.js';
import { textCanvasAdapter } from './textCanvas';

function fakeBase(seen: [string, unknown][]): Adapter {
  return {
    createCanvas: () => ({ getContext: (type: string, options?: unknown) => void seen.push([type, options]) }) as unknown as ICanvas,
  } as unknown as Adapter;
}

describe('textCanvasAdapter', () => {
  it('asks 2D contexts for willReadFrequently and keeps the caller options', () => {
    const seen: [string, unknown][] = [];
    const canvas = textCanvasAdapter(fakeBase(seen)).createCanvas(4, 4);
    canvas.getContext('2d');
    canvas.getContext('2d', { alpha: false });
    expect(seen).toEqual([['2d', { willReadFrequently: true }], ['2d', { willReadFrequently: true, alpha: false }]]);
  });

  it('leaves WebGL contexts alone', () => {
    const seen: [string, unknown][] = [];
    textCanvasAdapter(fakeBase(seen)).createCanvas(4, 4).getContext('webgl2', { antialias: true });
    expect(seen).toEqual([['webgl2', { antialias: true }]]);
  });
});
