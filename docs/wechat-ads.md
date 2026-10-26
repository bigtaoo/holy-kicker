# WeChat ads and error reports

The WeChat build shows WeChat's own ads (流量主) through the same `Ads` interface as every
other host (`client/src/platform/wechat/weChatAds.ts`), so the lobby's and the run's ad rules
apply unchanged. One rewarded video and one interstitial unit serve the whole game; their ids
live in `client/src/platform/wechat/adUnits.json`. While an id is empty that kind is off, and
with both empty the build has no ads at all (`NO_ADS`, the state it ships in today).

## The AppID

`client/wechat/project.config.json` holds `wx25a3b18a3e83ffce`, a mini-game account registered
for another game and borrowed for testing. It can preview on a phone but must not release Holy
Kicker: the account's name, category and filings belong to that game. The release needs a
mini-game account of its own (individual subject, free, no virtual payment, so no 版号), which
waits on a mainland phone number for the account, the 小程序备案 and the 软著 portal. Every
console step below happens on that new account.

A phone preview (DevTools logged in, 设置 → 安全设置 → 服务端口 on), after `npm run build:wechat`:

```
cli.bat open --project D:/standing/client/wechat
cli.bat preview --project D:/standing/client/wechat --qr-format image --qr-output qr.png
cli.bat close --project D:/standing/client/wechat
```

`cli.bat` sits beside the DevTools exe. Opening the project lets DevTools rewrite
`project.config.json` (it adds `minifyWXML`); revert that before committing.

## Console steps (mp.weixin.qq.com, the mini-game's account)

1. **Open 流量主.** 推广 → 流量主 → 开通. WeChat requires the mini-game to be released and to
   have at least 1,000 cumulative unique users, and no violations on record. The account's
   owner verifies with their bank details for the payout (the person does that themself).
2. **Create the units.** 流量主 → 广告管理 → 新建广告位:
   - type 激励式视频 (rewarded video), name `hk-rewarded`;
   - type 插屏广告 (interstitial), name `hk-interstitial`.
   Each gets an id like `adunit-0123456789abcdef`.
3. **Paste the ids** into `client/src/platform/wechat/adUnits.json`
   (`{ "rewarded": "adunit-…", "interstitial": "adunit-…" }`), run `npm run check`, commit, and
   `npm run build:wechat`.
4. **Test on a phone.** Upload from DevTools as a trial build (体验版) and play it on a real
   device: DevTools only shows a placeholder ad, and a fresh unit can answer "no fill" (error
   1004) for its first hours. Check that a rewarded offer pays only when the video is watched to
   the end, and that an interstitial never shows mid-wave (it rides the same `midgame` breaks as
   the web builds).
5. **Submit for review** as usual (版本管理 → 提交审核). Ads need no extra review item, but the
   game must not reward closing an ad early or hide the close button.

Interstitials have WeChat's own pacing on top of ours: none in the first 30 s after launch and
at most one per 30 s (the base library rejects `show`, which the game takes as "skip").

## Error reports

`wx.onError` and `wx.onUnhandledRejection` feed the same `anomaly` events as `window.onerror`
on the web (`client/src/net/anomaly.ts`, through `Platform.onScriptError`), with the
`game.js:line:col` read off the stack. The WeChat build has no backend yet (`apiBase` is null
for it until the domain below is filed), so every release build without one keeps up to 20
anomalies on the device (`client/src/net/anomalyStash.ts`) and the first launch that reaches
the backend sends them, stamped with that launch's time and build.

To turn the backend on for WeChat:

1. The domain `hk.gamestao.com` needs an ICP filing (备案) under the mini-game's entity.
2. 开发管理 → 开发设置 → 服务器域名: add `https://hk.gamestao.com` as a request domain
   (request 合法域名).
3. Before the next step, the consent the law asks for (China's PIPL wants consent before play
   data leaves the device, not the toast the rest of the world gets):
   - `PrivacyChoice` already treats every WeChat player as in the consent region
     (`client/src/net/privacyChoice.ts`): the lobby's consent card asks, and nothing is sent
     until the player taps Allow. Check the card in DevTools once the backend is on.
   - The card's Privacy button calls `Platform.openUrl`, which does nothing on WeChat (a
     mini-game opens no web pages). Wire it to `wx.openPrivacyContract` before the switch.
   - Fill in 用户隐私保护指引 in the console (设置 → 基本设置 → 服务内容声明) to match
     `server/src/privacy.zh.html`, and declare the request domain's data there.
4. Drop the `host === 'wechat'` case from `apiBase` (`client/src/net/backend.ts`).

Until then the stash only grows on the device; WeChat's own 运维中心 → 错误日志 in the console
shows the same errors in the meantime.

## Launch screen

The WeChat build opens on the health advice for games (健康游戏忠告, `boot.healthAdvice` in the
string tables), drawn over the screen from the moment the strings are in until the lobby is up,
and for at least 2 s (`client/src/ui/healthAdvice.ts`). Other hosts never show it.
