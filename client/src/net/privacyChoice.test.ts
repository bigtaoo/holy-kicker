import { describe, expect, it } from 'vitest';
import type { Sharing } from '../meta/privacy';
import type { Platform } from '../platform/types';
import { PrivacyChoice } from './privacyChoice';

function host(country: string | null, name: Platform['host'] = 'web') {
  const kept = new Map<string, string>();
  const opened: string[] = [];
  return {
    opened,
    host: name,
    storage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) },
    country: () => country,
    openUrl: (url: string) => void opened.push(url),
  };
}

function make(country: string | null, timeZone: string | null = null, h = host(country)) {
  const sent: Sharing[] = [];
  const boards: boolean[] = [];
  const choice = new PrivacyChoice({ setSharing: (s) => void sent.push(s), setBoards: (on) => void boards.push(on) }, h, 'https://hk.test', timeZone);
  return { choice, sent, boards, h };
}

describe('PrivacyChoice', () => {
  it('keeps the boards on whatever the data answer, until the player turns them off', () => {
    const { choice, boards, h } = make('DE');
    expect(boards).toEqual([true]);
    choice.set(false);
    expect(choice.boards()).toBe(true);
    choice.setBoards(false);
    expect(boards).toEqual([true, false]);
    expect(make('DE', null, h).boards).toEqual([false]);
  });

  it('asks in Germany and holds data until the answer, which it keeps', () => {
    const { choice, sent, h } = make('DE');
    expect(sent).toEqual(['hold']);
    expect(choice.asking()).toBe(true);
    expect(choice.noticeDue()).toBe(false);
    choice.set(true);
    expect(sent).toEqual(['hold', 'send']);
    expect(choice.asking()).toBe(false);
    // the next launch remembers it
    expect(make('DE', null, h).sent).toEqual(['send']);
  });

  it("asks every WeChat player first (China's PIPL wants consent, not a notice)", () => {
    const { choice, sent } = make(null, 'Asia/Shanghai', host(null, 'wechat'));
    expect(sent).toEqual(['hold']);
    expect(choice.asking()).toBe(true);
    expect(choice.noticeDue()).toBe(false);
  });

  it('only tells a player elsewhere, once, and stops on a no', () => {
    const { choice, sent, h } = make(null, 'America/Chicago');
    expect(sent).toEqual(['send']);
    expect(choice.asking()).toBe(false);
    expect(choice.noticeDue()).toBe(true);
    choice.noticeShown();
    expect(choice.noticeDue()).toBe(false);
    choice.set(false);
    expect(choice.sharing()).toBe(false);
    expect(make(null, 'America/Chicago', h).sent).toEqual(['off']);
  });

  it('opens the policy in the player language', () => {
    const { choice, h } = make('US');
    choice.openPolicy();
    expect(h.opened).toEqual(['https://hk.test/privacy']);
  });
});
