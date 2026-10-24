import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, updateSettings, VOLUME_STEPS } from './settings';

function memory(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('settings', () => {
  it('starts at full volume and auto quality for a new player or a broken file', () => {
    expect(loadSettings(memory())).toEqual({ locale: null, volume: VOLUME_STEPS, music: VOLUME_STEPS, keptVolume: VOLUME_STEPS, keptMusic: VOLUME_STEPS, quality: 'auto', fast: false, shake: true, dataSharing: 'ask', boards: true, noticeSeen: false, reminders: true, remindAsked: false, haptics: true, pairsTold: false });
    expect(loadSettings(memory({ 'hk.settings': 'not json' })).volume).toBe(VOLUME_STEPS);
    expect(loadSettings(memory({ 'hk.settings': '{"volume":9,"quality":"ultra"}' })))
      .toEqual({ locale: null, volume: VOLUME_STEPS, music: VOLUME_STEPS, keptVolume: VOLUME_STEPS, keptMusic: VOLUME_STEPS, quality: 'auto', fast: false, shake: true, dataSharing: 'ask', boards: true, noticeSeen: false, reminders: true, remindAsked: false, haptics: true, pairsTold: false });
  });

  it('reads an old file: sound off becomes volume 0', () => {
    expect(loadSettings(memory({ 'hk.settings': '{"locale":"zh","sound":true}' })))
      .toEqual({ locale: 'zh', volume: VOLUME_STEPS, music: VOLUME_STEPS, keptVolume: VOLUME_STEPS, keptMusic: VOLUME_STEPS, quality: 'auto', fast: false, shake: true, dataSharing: 'ask', boards: true, noticeSeen: false, reminders: true, remindAsked: false, haptics: true, pairsTold: false });
    expect(loadSettings(memory({ 'hk.settings': '{"sound":false}' })).volume).toBe(0);
    expect(loadSettings(memory({ 'hk.settings': '{"sound":false}' })).music).toBe(VOLUME_STEPS);
  });

  it('keeps what the player chose', () => {
    const kv = memory();
    saveSettings(kv, { locale: 'en', volume: 2, music: 1, keptVolume: 2, keptMusic: 3, quality: 'saver', fast: true, shake: false, dataSharing: 'no', boards: false, noticeSeen: true, reminders: false, remindAsked: true, haptics: false, pairsTold: true });
    expect(updateSettings(kv, { volume: 0 })).toEqual({ locale: 'en', volume: 0, music: 1, keptVolume: 2, keptMusic: 3, quality: 'saver', fast: true, shake: false, dataSharing: 'no', boards: false, noticeSeen: true, reminders: false, remindAsked: true, haptics: false, pairsTold: true });
    expect(loadSettings(kv)).toEqual({ locale: 'en', volume: 0, music: 1, keptVolume: 2, keptMusic: 3, quality: 'saver', fast: true, shake: false, dataSharing: 'no', boards: false, noticeSeen: true, reminders: false, remindAsked: true, haptics: false, pairsTold: true });
  });

  it('reads the levels the pause switches keep, falling back to the top step for none, off or out of range', () => {
    expect(loadSettings(memory({ 'hk.settings': '{"keptVolume":2,"keptMusic":4}' }))).toMatchObject({ keptVolume: 2, keptMusic: 4 });
    expect(loadSettings(memory({ 'hk.settings': '{"keptVolume":0,"keptMusic":9}' }))).toMatchObject({ keptVolume: VOLUME_STEPS, keptMusic: VOLUME_STEPS });
  });
});
