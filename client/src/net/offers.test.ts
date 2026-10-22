import { describe, expect, it } from 'vitest';
import { OfferLog, offered } from './offers';

type Sent = { at: unknown; outcome: unknown }[];
const tracker = (sent: Sent) => (_e: 'offer', p: Record<string, unknown>) => void sent.push({ at: p.at, outcome: p.outcome });

describe('OfferLog', () => {
  it('reports each place once, after the host answers', () => {
    const sent: Sent = [];
    const log = new OfferLog(tracker(sent));
    log.place('lobby_chest');
    expect(sent).toEqual([]);
    log.answer(true);
    log.place('lobby_chest');
    log.place('patrol_quick');
    expect(sent).toEqual([{ at: 'lobby_chest', outcome: 'shown' }, { at: 'patrol_quick', outcome: 'shown' }]);
  });

  it('reports nofill when no ad was ready', () => {
    const sent: Sent = [];
    const log = new OfferLog(tracker(sent));
    log.answer(false);
    log.place('patrol_double');
    expect(sent).toEqual([{ at: 'patrol_double', outcome: 'nofill' }]);
  });
});

describe('offered', () => {
  it('passes the answer through and reports it, unless the offer is not drawn', async () => {
    const sent: Sent = [];
    expect(await offered(tracker(sent), 'revive', Promise.resolve(false))).toBe(false);
    expect(await offered(tracker(sent), 'double', Promise.resolve(true), false)).toBe(true);
    expect(sent).toEqual([{ at: 'revive', outcome: 'nofill' }]);
  });
});
