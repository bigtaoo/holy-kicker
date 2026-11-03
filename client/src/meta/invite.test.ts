import { describe, expect, it } from 'vitest';
import { inviteCode, inviteOf, parseInvite } from './invite';

describe('weekly invite codes', () => {
  it('round-trips a week, its waves and a cleared run’s time', () => {
    for (const i of [inviteOf('w2026-45', 32, null), inviteOf('w2026-45', 50, 8123), inviteOf('w2027-01', 0, null)]) {
      expect(parseInvite(inviteCode(i))).toEqual(i);
    }
    expect(inviteCode(inviteOf('w2026-45', 32.7, null))).toBe('w2026-45.32');
    expect(inviteCode(inviteOf('w2026-45', 50, 8123))).toBe('w2026-45.50.8123');
  });

  it('turns down anything that is not a code', () => {
    for (const bad of [null, undefined, '', 'w2026-45', 'w2026-45.', 'w2026-45.100', 'x2026-45.3', 'w2026-45.3.', 'w2026-45.3.1234567', '{"level":3}']) {
      expect(parseInvite(bad), String(bad)).toBeNull();
    }
    expect(parseInvite(' w2026-45.7 ')).toEqual({ week: 'w2026-45', waves: 7, time: null });
  });
});
