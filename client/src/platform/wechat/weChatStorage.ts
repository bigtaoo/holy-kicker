import type { KeyValueStore } from '../../meta/saveStore';

/** WeChat's local storage as the game's key store; getStorageSync answers '' for a key never written. */
export function weChatStore(w: Pick<Wx, 'getStorageSync' | 'setStorageSync'>): KeyValueStore {
  return {
    getItem: (key) => {
      const v = w.getStorageSync(key);
      return typeof v === 'string' && v !== '' ? v : null;
    },
    setItem: (key, value) => w.setStorageSync(key, value),
  };
}
