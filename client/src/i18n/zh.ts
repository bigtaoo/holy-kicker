import type { en } from './en';
import type { Table } from './index';

// Simplified Chinese.
export const zh: Table<typeof en> = {
  lang: { name: '简体中文' },
  common: {
    continue: '继续',
    back: '返回',
    locked: '未解锁',
    comingSoon: '敬请期待',
  },
  lobby: {
    level: 'Lv.{level}',
    guest: '小和尚',
    play: '出战',
    best: '最佳：第 {wave} 波',
    notPlayed: '尚未挑战',
    cleared: '已通关',
    chapterTitle: '第 {n} 章：{name}',
    unlockAtChapter: '通关第 {n} 章解锁',
  },
  tab: {
    shop: '商店',
    gear: '装备',
    play: '出战',
    train: '修炼',
    codex: '图鉴',
    unlockLevel: 'Lv.{level} 解锁',
    unlockChapter: '通关第 {n} 章解锁',
    unlockFirstRun: '完成第一局后解锁',
  },
  chapter: {
    1: '荒寺',
    2: '雾沼',
    3: '雪岭',
    4: '鬼市',
    5: '魔窟',
  },
  run: {
    wave: '第 {wave}/{total} 波',
    paused: '暂停',
    resume: '继续',
    giveUp: '放弃',
  },
  results: {
    cleared: '通关！',
    fallen: '本局结束',
    reached: '完成波数：{wave}',
    copper: '铜钱 +{n}',
    chest: '宝箱（第 {wave} 波）：铜钱 +{copper}，玉 +{jade}',
    newBest: '新纪录！',
    double: '铜钱翻倍（看广告）',
    doubled: '铜钱已翻倍！',
  },
  settings: {
    title: '设置',
    language: '语言',
  },
  currency: {
    copper: '铜钱',
    jade: '玉',
  },
};
