import { describe, expect, it } from 'vitest';
import { bracketed } from './brackets';
import { NO_PORTAL } from './types';

describe('bracketed', () => {
  it('forwards only real changes of the gameplay state', () => {
    const calls: string[] = [];
    const portal = bracketed({
      ...NO_PORTAL,
      gameplayStart: () => calls.push('start'),
      gameplayStop: () => calls.push('stop'),
    });
    portal.gameplayStop();
    portal.gameplayStart();
    portal.gameplayStart();
    portal.gameplayStop();
    portal.gameplayStop();
    portal.gameplayStart();
    expect(calls).toEqual(['start', 'stop', 'start']);
  });
});
