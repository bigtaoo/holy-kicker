import { describe, expect, it } from 'vitest';
import { inviteParam, inviteUrl } from './inviteUrl';

describe('web invite links', () => {
  it("keeps only the page of the address and puts the code in `w`", () => {
    expect(inviteUrl('https://h.gamestao.com/new/?ads=fake#x', 'w2026-45.32')).toBe('https://h.gamestao.com/new/?w=w2026-45.32');
    expect(inviteParam('?w=w2026-45.32')).toBe('w2026-45.32');
  });

  it('reads `w` among other parameters, and nothing from a broken or missing one', () => {
    expect(inviteParam('?direct&w=w2026-45.50.8123&x=1')).toBe('w2026-45.50.8123');
    expect(inviteParam('?new=1')).toBeNull();
    expect(inviteParam('?w=')).toBeNull();
    expect(inviteParam('?w=%E0%A4%A')).toBeNull();
  });
});
