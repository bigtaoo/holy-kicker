import { describe, expect, it } from 'vitest';
import { expPairs, expTag } from '@hk/protocol';
import { BALANCE } from './balance';
import { EXPERIMENTS, armOf, enroll, enrollsNew, experimentTag, forcedArms, pickArm, runWaves, type Experiments } from './experiments';
import { newSave, parseSave } from './save';

const TABLE: Experiments = {
  first20: { note: '', hosts: ['crazygames'], arms: { control: 1, short: 1 } },
  later: { note: '', hosts: ['web'], arms: { a: 3, b: 1 } },
};

describe('experiments', () => {
  it('picks arms by weight', () => {
    expect(pickArm({ a: 3, b: 1 }, () => 0)).toBe('a');
    expect(pickArm({ a: 3, b: 1 }, () => 0.74)).toBe('a');
    expect(pickArm({ a: 3, b: 1 }, () => 0.75)).toBe('b');
    expect(pickArm({ a: 3, b: 1 }, () => 0.9999)).toBe('b');
    expect(pickArm({ a: 0, b: 0 }, () => 0.5)).toBe('');
    expect(pickArm({ 'Bad Name': 5 }, () => 0.5)).toBe('');
  });

  it('enrolls a new save once, on the hosts the experiment runs on', () => {
    const s = enroll(newSave(), 'crazygames', () => 0.6, TABLE);
    expect(s.arms).toEqual({ first20: 'short' });
    // later loads keep the arm, whatever the roll
    expect(enroll(s, 'crazygames', () => 0, TABLE)).toBe(s);
    // not on this host: nothing
    const web = newSave();
    expect(enroll(web, 'poki', () => 0, TABLE)).toBe(web);
  });

  it('keeps a player who has played already out, as not enrolled', () => {
    const old = { ...newSave(), firstRunDone: true, runs: 3 };
    expect(enroll(old, 'crazygames', () => 0, TABLE).arms).toEqual({ first20: '' });
    expect(enroll({ ...newSave(), runs: 1 }, 'crazygames', () => 0, TABLE).arms).toEqual({ first20: '' });
  });

  it('lets a dev ?arm= force an arm, even where the experiment does not run', () => {
    expect(forcedArms('first20:short,bad,Bad:x,later:b')).toEqual({ first20: 'short', later: 'b' });
    const s = enroll({ ...newSave(), runs: 9, arms: { first20: '' } }, 'poki', () => 0, TABLE, forcedArms('first20:short'));
    expect(s.arms.first20).toBe('short');
  });

  it('tags events with the arms of experiments still in the table', () => {
    const s = { ...newSave(), arms: { later: 'a', first20: 'short', gone: 'x', other: '' } };
    expect(experimentTag(s, { ...TABLE, other: TABLE.later })).toBe('first20:short,later:a');
    expect(expPairs(experimentTag(s, TABLE))).toEqual(['first20:short', 'later:a']);
    expect(armOf(s, 'gone', TABLE)).toBe('');
    expect(armOf(s, 'first20', TABLE)).toBe('short');
    expect(expTag({})).toBe('');
    expect(expPairs('first20:short;drop')).toEqual([]);
  });

  it('ships with no experiment enrolling anyone, and every run the full chapter', () => {
    for (const x of Object.values(EXPERIMENTS)) expect(x.hosts).toEqual([]);
    expect(enroll(newSave(), 'crazygames', () => 0).arms).toEqual({});
    expect(runWaves(enroll(newSave(), 'web', () => 0, EXPERIMENTS, { first20: 'short' }))).toBe(BALANCE.waves);
  });

  it('tells a save about to be enrolled, reading it only where an experiment runs', () => {
    let reads = 0;
    const read = (s = newSave()) => () => (reads++, s);
    expect(enrollsNew(read(), 'wechat', TABLE)).toBe(false);
    expect(reads).toBe(0);
    expect(enrollsNew(read(), 'web', TABLE)).toBe(true);
    expect(enrollsNew(read({ ...newSave(), runs: 1 }), 'web', TABLE)).toBe(false);
    expect(enrollsNew(read({ ...newSave(), firstRunDone: true }), 'web', TABLE)).toBe(false);
    expect(enrollsNew(read({ ...newSave(), arms: { later: 'a' } }), 'web', TABLE)).toBe(false);
    expect(enrollsNew(read(), 'web', { x: { note: '', hosts: ['web'], arms: { a: 0 } } })).toBe(false);
    // nothing runs anywhere today: no boot waits on the cloud for an arm
    expect(enrollsNew(read(), 'web')).toBe(false);
    expect(enrollsNew(read(), 'ios')).toBe(false);
  });

  it('reads the arms and the tester mark from a save, dropping malformed ones', () => {
    const s = parseSave(JSON.stringify({ ...newSave(), arms: { first20: 'short', other: '', 'Bad Id': 'x', worse: 5 }, tester: true }));
    expect(s.arms).toEqual({ first20: 'short', other: '' });
    expect(s.tester).toBe(true);
    const old = parseSave(JSON.stringify({ ...newSave(), arms: undefined, tester: undefined }));
    expect(old.arms).toEqual({});
    expect(old.tester).toBe(false);
  });
});
