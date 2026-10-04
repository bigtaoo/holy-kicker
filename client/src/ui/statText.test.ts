import { describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { statLines, statText } from './statText';

describe('stat text', () => {
  it('shows regen per mille as a percent and keeps a fixed order', () => {
    setLocale('en');
    expect(statText('regen', 4)).toBe('Heal 0.4% health/s');
    expect(statLines({ magnet: 10, attack: 5, crit: 0 })).toEqual(['Attack +5%', 'Pickup range +10%']);
  });
});
