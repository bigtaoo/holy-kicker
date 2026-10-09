# Store listing

Text and image plan for the CrazyGames submission (and later WeChat). English is the source;
the Chinese column is for the WeChat listing and the CrazyGames zh page.

## CrazyGames fields

| Field | Value |
|---|---|
| Title | Holy Kicker (zh: 蹴鞠僧) |
| Category | Action (secondary: Casual) |
| Tags | survival, roguelite, bullet heaven, monster, one hand, upgrade, mobile, idle |
| Orientation | Portrait; desktop plays in a 3:4 window |
| Devices | Desktop and mobile |
| Multiplayer | No |
| Languages | English, Simplified Chinese |

### Short description (one line)

- en: Kick your way through a horde of ghosts as a kung-fu monk with a magic ball.
- zh: 一个和尚、一颗蹴鞠，踢穿成群结队的妖魔鬼怪。

### About the game

**en**

> Holy Kicker is a one-thumb horde survivor. A cheerful monk kicks a magic cuju ball through
> a land overrun by ghosts, and his attacks are all automatic: you only steer.
>
> Every level up you pick one of three upgrades: Buddha Palm, Vajra Bolt, Flying Cymbals and
> more. Max a spell and pair it with the right passive to evolve it into something much
> bigger. Survive 50 waves, elite monsters and two bosses to clear a chapter.
>
> Between runs, merge the gear you find, train your monk and unlock new relics: a staff, a
> wooden fish, prayer beads and an alms bowl, each of which changes how you play. Five
> chapters lead from a ruined temple to Demon Peak, where the last enemy is yourself.

**zh**

> 《蹴鞠僧》是一款单手操作的割草肉鸽游戏。一个乐呵呵的小和尚踢着蹴鞠，闯进妖魔横行的
> 山野。攻击全是自动的，你只管走位。
>
> 每次升级三选一：如来掌、金刚雷、飞钹……把法术升满，再配上对应的心法，就能进化成更强的形态。
> 撑过 50 波怪、精英和两个 Boss，才算打通一章。
>
> 局外合成装备、修炼武僧、解锁新法器：禅杖、木鱼、念珠、钵盂，每件都会改变打法。五个章节从荒寺
> 一路打到魔窟，最后的敌人是你自己。

### Controls

| | en | zh |
|---|---|---|
| Mobile | Drag anywhere on the screen to move. Attacks are automatic. | 按住屏幕任意处拖动来移动，攻击自动释放。 |
| Desktop | WASD or the arrow keys (or drag with the mouse) to move. Attacks are automatic. | WASD 或方向键移动（也可以按住鼠标拖动），攻击自动释放。 |

## Images

CrazyGames asks for three covers; no text other than the game logo, nothing small, readable at
thumbnail size.

| Image | Size | Composition |
|---|---|---|
| Landscape cover | 1920×1080 | The monk mid-kick on the left third, the ball flying right into a crowd of jiangshi and wisps, the Fallen Abbot looming behind; logo top centre |
| Portrait cover | 800×1200 | The monk mid-kick in the lower half, horde above; logo on top |
| Square cover | 800×800 | Monk and ball only, close up; logo at the bottom |
| Preview video, landscape | 1920×1080 (16:9), 15–20 s, ≤50 MB | Required. The cover still, then a mid-run fight (see "Video") |
| Preview video, portrait | 1080×1620 (2:3), 15–20 s, ≤50 MB | Required. The same, at the portrait cover's shape |

Covers are painted key art in the game's sticker style (see `docs/content.md` and
`art/monk/`), not cropped gameplay: a portrait game screen does not fill a 16:9 cover.

## Video

CrazyGames' rules ([game covers](https://docs.crazygames.com/requirements/game-covers/), checked
2026-10-07): both a 16:9 and a 2:3 video, 15–20 s (longer is cut at 20 s), at most 50 MB; **the
static cover as the opening frame**; no sound; no black screen or logo transition, no black bars,
no mouse pointer, no "Play now" or other promotional text, no app or social icons; no fast-forward
(the portal speeds the video up a little itself).

They are recorded from the game's own canvas, so there is no pointer, browser frame or sound:

1. `npm run dev`, then for each shape
   `node tools/record_video.mjs landscape --from 35 --seconds 40` (and `portrait`). It opens
   the system Chrome in a window of its own and loads
   `?direct&autoplay&record=40&shape=landscape&from=35&chapter=1&seed=7&quality=high`: the canvas
   is drawn at the video's exact size (`shape`: `landscape` 1920×1080, `portrait` 1080×1620,
   `phone` 1080×1920), the balance bot plays, rushes at 6x to wave `from` taking its cards at
   once (so the hero has a real build), then plays at normal speed while 40 s are recorded. The
   file lands in `art/store/video/raw/` (not committed). Keep the window visible: a hidden page
   stops drawing, which is why this is not done in the in-app browser.
2. Pick the best 19 s and cut: `python tools/store_video.py landscape <raw.mp4> <start s>`
   writes `art/store/video/en_landscape.mp4`: 1 s of the cover drawn at the video's size by
   `cover_final.py`, a hard cut to the fight, H.264 CRF 23, 60 fps, no audio track, faststart.

The landscape video widens the view past the game's 3:4 cap (the recorder's `wide` viewport): it
shows the same world area as the widest real play area, spread to 16:9, rather than side bars.
The boss bar keeps its portrait height there and lands across the hero, so the landscape video
avoids boss waves (20, 35, 50); the portrait one can show the mid-boss. The bot can fall during
the rush (the runs are not repeatable frame for frame); the script then fails the take, and
another `--seed` usually gets through. Don't edit client code while a take records: Vite reloads
the page.
The covers and videos are uploaded by hand on the developer portal (funny found a scripted file
drop rejected with `UploadType is not properly set`).

## Title and logo

- Chinese title: **蹴鞠僧** (decided 2026-10-04); used for the WeChat listing and the zh page.
- **Logo**: decided; the lettered "Holy Kicker" and 蹴鞠僧 in the sticker style (thick dark
  outline, flat saffron and gold, one hard shadow), set from SIL OFL fonts so the shipped logo
  needs no font licence.

## CrazyGames QA (2026-10-05)

The `npm run build:crazygames` bundle was checked against docs.crazygames.com (technical,
gameplay, ads, quality and SDK game-module pages). It was served from a sub-path
(`/games/holy-kicker/`) with the real SDK, which was 3.8.0 in its `local` environment.

| Requirement | Result |
|---|---|
| ≤250 MB, ≤1,500 files, relative paths only | 7.8 MB in 120 files; nothing absolute in the bundle; loads from a sub-path |
| ≤50 MB initial download (≤20 MB for the mobile homepage); ≤20 s to gameplay | The whole bundle is 7.8 MB; locally the first run starts about 0.5 s after the page opens (audio and chapters 2–5 load later) |
| New users land in gameplay | The first launch goes straight into chapter 1, with the move hint |
| loadingStart / loadingStop / gameplayStart / gameplayStop | All sent; pause, death, revive and results bracket play, and each change is sent once (`platform/brackets.ts`) |
| happytime used sparingly | Only on a first chapter clear (a boss kill) |
| Midgame ads only at breaks, never after the first run | Only results → lobby, from the second run on |
| Mute during an ad, from when it starts until it ends; pause the game | Muted on `adStarted`; ads only play outside a run |
| Rewarded: video icon, skip option the same size and colour, reward confirmed, none on `adError` | Double copper and revive both follow this; the copper line shows the doubled total |
| Adblock: no penalty, no inert buttons | Rewarded offers are hidden when `hasAdblock` is true |
| Basic Launch (the first submission) allows no ads | `prefetchAd` throws `adsDisabledBasicLaunch` there, so rewarded offers, the lobby banner and break ads are all left out; the same bundle shows them once the game moves to Full Launch |
| Portal `muteAudio` takes priority | Holds every sound while set (`?muteAudio=true` checked) |
| English, SDK locale first | en and zh; the SDK locale is read before the browser's |
| Legible from 800×450 to 1920×1080; desktop landscape | Portrait 3:4 play area with side bars; HUD and lobby text are readable at 800×450 |
| No custom fullscreen button, no Escape, AZERTY-safe keys | None; movement reads physical key codes, so ZQSD works on AZERTY |
| No page scroll or selection, safe areas | Arrow keys are cancelled; `user-select` and `touch-action` are set in `index.html`; safe-area insets are respected |
| External links only in a new tab; a privacy notice for data beyond the SDK | The only link is the privacy policy (settings and the consent card), opened in a new tab; see "Privacy" below |
| Username shown, no login screen | The lobby header shows the SDK username; a guest on a page with accounts sees "Guest" and no leaderboard |

## Privacy

The game sends its own analytics, leaderboard runs (with the CrazyGames username) and problem
reports to hk.gamestao.com (server/README.md), so CrazyGames asks for a privacy notice. The policy
is served by the backend at https://hk.gamestao.com/privacy (`?lang=zh` for Chinese;
`server/src/privacy.{en,zh}.html`). The rules are in `client/src/meta/privacy.ts`, with as few taps
as the law allows:

| Where | What the player sees | What is sent |
|---|---|---|
| EEA, UK, Switzerland (the portal's `countryCode`, else a `Europe/*` time zone) | Nothing during the first run; then a card at the foot of the lobby: Allow / No thanks / Privacy. It blocks nothing and stays until answered | Nothing until Allow: events wait on the device, no run, name or install id goes out, and no install id is even stored. No thanks drops them |
| Everywhere else | A toast over the first run, once (no tap): data is sent, turn it off in Settings | Everything, until switched off |

Settings → Play data has the sharing switch, the policy link and the install's play ID (what a
deletion request names). A problem report is sent only when the player asks, so it always goes.
Offline builds and WeChat (no backend yet) show none of this.

Still to check on the portal itself: upload the zip to the developer portal's QA preview, then
watch a real ad fill, a signed-in save carry over between devices, and the leaderboard button
hidden for a guest (read from the SDK's `user.isUserAccountAvailable`).

## App Store (iOS)

The listing for the iPhone app (`docs/ios.md`), entered in App Store Connect 2026-10-09. en-US is
the primary language; zh-Hans is the second localisation (mainland China is not a storefront).

| Field | en-US | zh-Hans |
|---|---|---|
| Name (30) | HolyKicker (the record's; "Holy Kicker" was taken) | 蹴鞠僧 |
| Subtitle (30) | Kung-fu monk vs ghost hordes | 单手割草，踢穿妖魔大军 |
| Keywords (100) | roguelite,horde,survivor,bullet heaven,kung fu,shaolin,monk,ghost,offline,one hand,action,rpg,idle | 割草,肉鸽,幸存者,弹幕,和尚,武僧,功夫,少林,妖怪,僵尸,单机,离线,单手,动作,休闲,蹴鞠 |
| Promotional text (170) | One thumb, one monk, one magic ball, and a whole land of ghosts. Pick your upgrades, evolve your spells and survive 50 waves. | 一根手指、一个和尚、一颗蹴鞠，对上满山的妖魔鬼怪。三选一升级、进化法术，撑过 50 波！ |

Shared: Support URL and Marketing URL `https://gamestao.com/` (support@gamestao.com is on it),
privacy policy `https://hk.gamestao.com/privacy`, copyright `2026 Tao Wang`, category Games →
Action and Casual, free, every storefront but mainland China.

### Description

**en**

> Holy Kicker is a one-thumb horde survivor. A cheerful monk kicks a magic cuju ball through a
> land overrun by ghosts, and every attack is automatic: you only steer.
>
> • Every level up, pick one of three upgrades: Buddha Palm, Vajra Bolt, Flying Cymbals and more.
> • Max a spell and pair it with the right passive to evolve it into something much bigger.
> • Survive 50 waves, elite monsters and two bosses to clear a chapter.
> • Between runs, merge the gear you find, train your monk and unlock relics: a staff, a wooden
>   fish, prayer beads and an alms bowl, each of which changes how you play.
> • Five chapters lead from a ruined temple to Demon Peak, where the last enemy is yourself.
> • Plays offline, with no account and no sign-up. Climb each chapter's leaderboard under your
>   Game Center nickname.
>
> Ads are optional videos for bonuses, plus a short break between runs. The one-time Ad-free card
> pays every ad reward at once and removes all ads; the daily limits stay the same.

**zh**

> 《蹴鞠僧》是一款单手操作的割草肉鸽游戏。一个乐呵呵的小和尚踢着蹴鞠，闯进妖魔横行的山野。
> 攻击全是自动的，你只管走位。
>
> • 每次升级三选一：如来掌、金刚雷、飞钹……
> • 把法术升满，再配上对应的心法，就能进化成更强的形态。
> • 撑过 50 波怪、精英和两个 Boss，才算打通一章。
> • 局外合成装备、修炼武僧、解锁新法器：禅杖、木鱼、念珠、钵盂，每件都会改变打法。
> • 五个章节从荒寺一路打到魔窟，最后的敌人是你自己。
> • 支持离线游玩，无需账号和注册。用 Game Center 昵称冲击每一章的排行榜。
>
> 广告都是可选的奖励视频，另有两局之间的短广告。一次性购买的去广告卡让所有广告奖励直接到账、
> 不再播放任何广告；每日次数上限不变。

### Review notes

> No account or sign-in is needed. The first launch goes straight into a short first run of
> chapter 1: drag anywhere to move, attacks are automatic. When the run ends (or Pause → Give up),
> the lobby opens.
>
> In-app purchase: the Ad-free card (com.gamestao.holykicker.adfree, non-consumable) is on the
> lobby's Shop tab, which is open from the first lobby, with Restore on the same card. It pays every
> rewarded-ad bonus at once and stops all ads; it unlocks nothing else.
>
> Ads: Google AdMob, rewarded videos for optional bonuses (double copper after a run, a revive)
> and an interstitial between runs from the second run on. Non-personalised ads only; the app does
> not track, so there is no App Tracking Transparency prompt. Google's consent form appears in the
> EEA, the UK and Switzerland.
>
> Game Center is optional: when signed in, the nickname shows in the lobby and on the chapter
> leaderboards; otherwise the game rolls a random name.

### Screenshots

Five per language in `art/store/ios/` (`en_*`, `zh_*`): a chapter 1 horde at wave 30, the level-up
cards, the wave 20 twin jiangshi, chapter 3's snow at wave 12, and the lobby of a save two
chapters in. Each was taken from the dev build with Playwright (system Chrome, headless, 430×932
at 3×, so 1290×2796): the balance bot plays (`?direct&autoplay&from=N&chapter=C&seed=S`) until a
condition on `__shell.game.engine.state` holds, the dev fps readout (`game.label`) is hidden, and
the page is captured; the lobby seeds `hk.save` before the page loads. A bot that falls on the
way never reaches the wave, so a take that times out is retried with another seed. App Store
Connect's required size is the 6.1"/6.3" iPhone (1179×2556, the same aspect), so the uploads are
scaled to it.
