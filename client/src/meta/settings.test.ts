import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from './settings';

function memory(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('settings', () => {
  it('turns sound on for a new player and an old settings file', () => {
    expect(loadSettings(memory()).sound).toBe(true);
    expect(loadSettings(memory({ 'hk.settings': '{"locale":"zh"}' }))).toEqual({ locale: 'zh', sound: true });
    expect(loadSettings(memory({ 'hk.settings': 'not json' })).sound).toBe(true);
  });

  it('keeps sound off once the player turned it off', () => {
    const kv = memory();
    saveSettings(kv, { locale: null, sound: false });
    expect(loadSettings(kv).sound).toBe(false);
  });
});
