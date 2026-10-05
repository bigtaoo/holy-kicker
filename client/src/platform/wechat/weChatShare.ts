import { getLocale, t } from '../../i18n';

// Forwarding from the capsule's … menu: to a chat (onShareAppMessage) and to Moments
// (onShareTimeline). Without the handlers the menu items are greyed out. The card is the
// store cover cut to 5:4 (tools/cover_final.py writes client/wechat/share/<lang>.jpg, in the
// main package); Moments shows the game's icon instead, so it gets the title alone. The
// callbacks run at share time, so they pick up a language changed in settings.
// WeChat calls them when the player picks a forward, before the friend picker (it no longer
// says whether the share went through), so `onShare` counts picks, not completed shares.
export function installWeChatShare(onShare: (to: 'chat' | 'moments') => void): void {
  if (typeof wx.onShareAppMessage !== 'function') return;
  wx.showShareMenu?.({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
  wx.onShareAppMessage(() => {
    onShare('chat');
    return { title: t('share.title'), imageUrl: `share/${getLocale()}.jpg` };
  });
  wx.onShareTimeline?.(() => {
    onShare('moments');
    return { title: t('share.title') };
  });
}
