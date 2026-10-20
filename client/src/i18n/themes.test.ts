import { beforeAll, describe, expect, it } from 'vitest';
import { CORGI } from './corgi';
import { MORE as CORGI_MORE } from './corgi/more';
import { en } from './en';
import { MONK } from './monk';
import { monkEn } from './monk/en';
import { MORE as MONK_MORE } from './monk/more';
import { MORE } from './more';
import { overlay } from './overlay';
import { zh } from './zh';

// The themes' words (docs/reskin.md "Words"): Holy Kicker's (i18n/monk) and Corgi Commando's
// (i18n/corgi), each laid over the shared tables in its own build only.

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

const THEMES = { monk: { now: MONK, more: MONK_MORE }, corgi: { now: CORGI, more: CORGI_MORE } };
const TABLES: Record<string, Record<string, object>> = { monk: { ...MONK }, corgi: { ...CORGI } };
const each = () => Object.entries(TABLES).flatMap(([theme, tables]) => Object.entries(tables).map(([l, table]) => [`${theme} ${l}`, table] as const));

/** Each string of `table` with a word from `words`, placeholders aside. */
const naming = (table: object, words: RegExp) =>
  leaves(table).map((k) => `${k}: ${at(table, k)}`).filter((line) => words.test(line.split(': ')[1]!.replace(/\{\w+\}/g, '')));
const MONK_EN = /monk|relic|copper|jade|chapter|sutra|temple|demon|shrine|kick|training/i;
const MONK_ZH = /和尚|僧|法器|法宝|法术|铜钱|玉|章|经文|寺|修炼|神龛|巡山|妖|魔|踢|鞠/;

describe('theme words', () => {
  beforeAll(async () => {
    for (const [theme, { more }] of Object.entries(THEMES)) {
      for (const [l, load] of Object.entries(more)) TABLES[theme]![l] = await load!();
    }
  });

  it('come in every language the game ships, for both themes', () => {
    for (const { more } of Object.values(THEMES)) expect(Object.keys(more).sort()).toEqual(Object.keys(MORE).sort());
    for (const tables of Object.values(TABLES)) expect(Object.keys(tables).sort()).toEqual(['en', 'zh', ...Object.keys(MORE)].sort());
  });

  it('name only strings the shared tables leave out', () => {
    const shared = new Set(leaves(en));
    expect(leaves(monkEn).filter((k) => shared.has(k))).toEqual([]);
  });

  it('have the same keys in every language and theme, none empty', () => {
    const keys = leaves(monkEn).sort();
    for (const [name, table] of each()) {
      expect(leaves(table).sort(), name).toEqual(keys);
      for (const k of keys) expect(at(table, k), `${name} ${k}`).not.toBe('');
    }
  });

  it('keep the placeholders of monk/en.ts, since the game fills the same ones', () => {
    for (const [name, table] of each()) {
      for (const k of leaves(monkEn)) expect(`${k} ${holes(at(table, k))}`, name).toBe(`${k} ${holes(at(monkEn, k))}`);
    }
  });

  it('keep sixteen board nouns', () => {
    for (const [name, table] of each()) expect(at(table, 'board.nouns')?.split('|'), name).toHaveLength(16);
  });

  it('lay over the shared table and leave it alone', () => {
    const corgi = overlay(en, CORGI.en);
    expect(corgi.chapter[1]).toBe('Frost Moon');
    expect(corgi.monk.kicker.name).toBe('Biscuit');
    expect(corgi.monk.kicker.role).toBe(en.monk.kicker.role);
    expect(corgi.lobby.play).toBe(en.lobby.play);
    expect(overlay(en, MONK.en).chapter[1]).toBe('Ruined Temple');
    expect('chapter' in en).toBe(false);
  });

  it("leave no monk words in the shared English and Chinese, nor in the corgi's", () => {
    expect(naming(en, MONK_EN)).toEqual([]);
    expect(naming(zh, MONK_ZH)).toEqual([]);
    expect(naming(CORGI.en, MONK_EN)).toEqual([]);
    expect(naming(CORGI.zh, MONK_ZH)).toEqual([]);
  });
});
