import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, updateSettings, VOLUME_STEPS } from './settings';

function memory(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('settings', () => {
  it('starts at full volume and auto quality for a new player or a broken file', () => {
    expect(loadSettings(memory())).toEqual({ locale: null, volume: VOLUME_STEPS, quality: 'auto' });
    expect(loadSettings(memory({ 'hk.settings': 'not json' })).volume).toBe(VOLUME_STEPS);
    expect(loadSettings(memory({ 'hk.settings': '{"volume":9,"quality":"ultra"}' })))
      .toEqual({ locale: null, volume: VOLUME_STEPS, quality: 'auto' });
  });

  it('reads an old file: sound off becomes volume 0', () => {
    expect(loadSettings(memory({ 'hk.settings': '{"locale":"zh","sound":true}' })))
      .toEqual({ locale: 'zh', volume: VOLUME_STEPS, quality: 'auto' });
    expect(loadSettings(memory({ 'hk.settings': '{"sound":false}' })).volume).toBe(0);
  });

  it('keeps what the player chose', () => {
    const kv = memory();
    saveSettings(kv, { locale: 'en', volume: 2, quality: 'saver' });
    expect(updateSettings(kv, { volume: 0 })).toEqual({ locale: 'en', volume: 0, quality: 'saver' });
    expect(loadSettings(kv)).toEqual({ locale: 'en', volume: 0, quality: 'saver' });
  });
});
