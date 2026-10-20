import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../en';
import { MORE } from '../more';
import { overlay } from '../overlay';
import { zh } from '../zh';
import { CORGI, CORGI_MORE } from './index';
import { corgiEn } from './en';

type Node = { [key: string]: string | Node };

function leaves(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}

function at(node: object, key: string): string | undefined {
  let n: unknown = node;
  for (const part of key.split('.')) n = (n as Node | undefined)?.[part];
  return typeof n === 'string' ? n : undefined;
}

const holes = (s: string | undefined) => (s?.match(/\{\w+(?=[:}])/g) ?? []).sort().join();

const TABLES: Record<string, object> = { ...CORGI };

describe('corgi words', () => {
  beforeAll(async () => {
    for (const [l, load] of Object.entries(CORGI_MORE)) TABLES[l] = await load();
  });

  it('comes in every language the game ships', () => {
    expect(Object.keys(CORGI_MORE).sort()).toEqual(Object.keys(MORE).sort());
    expect(Object.keys(TABLES).sort()).toEqual(['en', 'zh', ...Object.keys(MORE)].sort());
  });

  it('only renames strings the base table has', () => {
    const base = new Set(leaves(en));
    expect(leaves(corgiEn).filter((k) => !base.has(k))).toEqual([]);
  });

  it('has the same keys in every language, none empty', () => {
    const keys = leaves(corgiEn).sort();
    for (const [l, table] of Object.entries(TABLES)) {
      expect(leaves(table).sort(), l).toEqual(keys);
      for (const k of keys) expect(at(table, k), `${l} ${k}`).not.toBe('');
    }
  });

  it('keeps the base placeholders, since the game fills the same ones', () => {
    for (const [l, table] of Object.entries(TABLES)) {
      for (const k of leaves(corgiEn)) expect(`${k} ${holes(at(table, k))}`, l).toBe(`${k} ${holes(at(en, k))}`);
    }
  });

  it('keeps sixteen board nouns', () => {
    for (const [l, table] of Object.entries(TABLES)) expect(at(table, 'board.nouns')?.split('|'), l).toHaveLength(16);
  });

  it('replaces the strings it names and leaves the base tables alone', () => {
    const corgi = overlay(en, corgiEn);
    expect(corgi.chapter[1]).toBe('Frost Moon');
    expect(corgi.monk.kicker.name).toBe('Biscuit');
    expect(corgi.monk.kicker.role).toBe(en.monk.kicker.role);
    expect(corgi.lobby.play).toBe(en.lobby.play);
    expect(en.chapter[1]).toBe('Ruined Temple');
    expect(overlay(en, undefined)).toBe(en);
  });

  it("leaves no monk words in the corgi's English and Chinese", () => {
    const monkish = (table: object, words: RegExp) => leaves(table).map((k) => `${k}: ${at(table, k)}`).filter((line) => words.test(line.split(': ')[1]!.replace(/\{\w+\}/g, '')));
    expect(monkish(overlay(en, CORGI.en), /monk|relic|copper|jade|chapter|sutra|temple|demon|shrine|kick|training/i)).toEqual([]);
    expect(monkish(overlay(zh, CORGI.zh), /和尚|僧|法器|法宝|法术|铜钱|玉|章|经文|寺|修炼|神龛|巡山|妖|魔|踢|鞠/)).toEqual([]);
  });
});
