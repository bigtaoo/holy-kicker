# Store listing

Text and image plan for the CrazyGames submission (and later WeChat). English is the source;
the Chinese column is for the WeChat listing and the CrazyGames zh page.

## CrazyGames fields

| Field | Value |
|---|---|
| Title | Holy Kicker (zh: 蹴鞠僧) |
| Category | Action (secondary: Casual) |
| Tags | survival, roguelite, bullet heaven, monster, one hand, upgrade, mobile, idle |
| Orientation | Portrait on phones; desktop and tablets held sideways play in landscape, 16:10 to 16:9 (only a phone on its side is asked to turn) |
| Devices | Desktop and mobile |
| Multiplayer | No |
| Languages | English, Simplified Chinese |

### Short description (one line)

- en: Kick your way through a horde of ghosts as a kung-fu monk with a magic ball.
- zh: 一个和尚、一颗蹴鞠，踢穿成群结队的妖魔鬼怪。

### About the game

**en**

> Holy Kicker is a one-thumb horde survivor. A cheerful monk kicks a magic cuju ball through
> a land overrun by ghosts. There is no attack button: every attack is automatic, and you only
> steer, with one finger, the keys or just the mouse.
>
> Every level up you pick one of three upgrades: Buddha Palm, Vajra Bolt, Flying Cymbals and
> more. Max a spell and pair it with the right passive to evolve it into something much
> bigger. Survive 50 waves, elite monsters and two bosses to clear a chapter.
>
> **Features**
> - 20 chapters across five lands, from the Ruined Temple to Demon Peak, where the last enemy is yourself
> - 11 spells, 5 relics and 8 passives, and 16 evolutions
> - 3 monks who each play their own way
> - A dozen kinds of ghosts, 4 elites and 6 bosses; an elite every five waves
> - Three stars and a hard mode in every chapter
> - Daily and weekly challenges with leaderboards, daily tasks, achievements and a codex
> - Between runs: merge gear, train your monk, send him on patrol
> - 15 languages; plays offline

**zh**

> 《蹴鞠僧》是一款单手操作的割草肉鸽游戏。一个乐呵呵的小和尚踢着蹴鞠，闯进妖魔横行的
> 山野。没有攻击键，攻击全是自动的，你只管走位：一根手指、方向键，或者直接移动鼠标。
>
> 每次升级三选一：如来掌、金刚雷、飞钹……把法术升满，再配上对应的心法，就能进化成更强的形态。
> 撑过 50 波怪、精英和两个 Boss，才算打通一章。
>
> **特色**
> - 20 章，五片地界，从荒寺一路打到魔窟，最后的敌人是你自己
> - 11 种法术、5 件法器、8 种心法，16 种进化
> - 3 位武僧，各有各的打法
> - 十几种妖怪、4 种精英、6 个 Boss，每 5 波一只精英
> - 每章三星评级，另有困难模式
> - 每日、每周挑战和排行榜，每日任务、成就、图鉴
> - 局外合成装备、修炼武僧、派他去巡山
> - 15 种语言，支持离线游玩

### Controls

| | en | zh |
|---|---|---|
| Mobile | Drag anywhere on the screen to move. Attacks are automatic. | 按住屏幕任意处拖动来移动，攻击自动释放。 |
| Desktop | WASD or the arrow keys to move, or just move the mouse and the hero follows it. Attacks are automatic. | WASD 或方向键移动，也可以直接移动鼠标让主角跟着走，攻击自动释放。 |

## Images

CrazyGames asks for three covers; no text other than the game logo, nothing small, readable at
thumbnail size.

| Image | Size | Composition |
|---|---|---|
| Landscape cover | 1920×1080 | The laughing monk on the left, the cuju ball bursting with a white-gold star into a packed horde of teal and purple ghosts that fills the right half up to the temple; logo top right |
| Portrait cover | 800×1200 | The same scene stacked: ball and horde on top, the monk in front at the bottom; no logo |
| Square cover | 800×800 | The same scene, the monk bottom left; no logo |
| Preview video, landscape | 1920×1080 (16:9), 15–20 s, ≤50 MB | Required. The cover still, then a mid-run fight (see "Video") |
| Preview video, portrait | 1080×1620 (2:3), 15–20 s, ≤50 MB | Required. The same, at the portrait cover's shape |

The covers show the monk against a whole horde: the first painted covers (a monk facing a boss)
read as a duel, and on 2026-10-14 Holy Kicker's click-through on the portal was half of a game
launched the same day with the same exposure. A collage of the game's own sprites followed
(`tools/cover_horde_ref.py`), but at thumbnail size it was grey-blue noise around a small monk;
since 2026-10-16 the covers are painted again (`art/store/README.md`), the horde big and bright,
few kinds, so it reads at thumbnail size. Only the landscape cover, shown big on the game page,
carries the logo: on the small grid thumbnails it would be unreadable and cover the horde, and the
portal prints the title beside them.

The corgi's first Playgama covers (`art/reskin/corgi/store/playgama_*.png`) were mascot posters,
a big corgi face and no gameplay. Since 2026-10-26 ~07:57 UTC its Playgama app carries
`draft_{landscape,portrait,square}.png` instead: a high top-down view with the corgi in the middle
(about 40 % of the short side) and a ring of red-eyed bugs closing in, bolts fanning out to the
front rank, bursts, gems and damage numbers. They are a sprite collage again
(`tools/cover_corgi_horde.py`), but brighter and with fewer kinds of bugs than the monk's grey
one; only the landscape was repainted by `tools/edit_image.sh`, because repainting the others
thinned the ring and lost the gems. `tools/cover_corgi_bust.py` makes the unused variant B, the
mobile-ad layout with a small battle and a big corgi bust in a corner. `draft_compare.png` puts all
three sets side by side at full and grid-tile size. The sandbox has no cover A/B test, so the
only comparison is the traffic before and after the swap.

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

A landscape take plays a real landscape run (`RunConfig.wide`, about 2130×1200 world units, the
HUD in the corners), so the boss bar no longer crosses the hero and either video can show a boss
wave. The monk's `en_landscape.mp4` was recorded before that, with the recorder widening the old
3:4 view to 16:9; re-record it the same way before it is uploaded again. The bot can fall during
the rush (the runs are not repeatable frame for frame); the script then fails the take, and
another `--seed` usually gets through. Don't edit client code while a take records: Vite reloads
the page.
### Corgi Commando

`node tools/record_video.mjs <shape> --theme corgi …` records from the corgi's dev server
(`npm run dev:new`, port 5184) into `art/reskin/corgi/store/video/raw/`, and
`python tools/store_video.py <shape> <raw.mp4> <start s> en corgi` cuts
`art/reskin/corgi/store/video/en_{landscape,portrait}.mp4` with the corgi's draft cover
(`draft_{shape}.png`, no logo: the corgi has none) as the opening second. The 2026-10-27 takes:
landscape chapter 1 from wave 24 (seed 7, an elite at wave 25), portrait from wave 18 (seed 7,
cut from 18 s, the Twin Ram Beetles mid-boss arriving near the end). `python
tools/cover_corgi_final.py` cuts the same drafts to CrazyGames' three cover sizes in
`art/reskin/corgi/store/final/en_*.png`. The drafts carry damage numbers; if CrazyGames reads
them as text on a cover, redraw them without (`cover_corgi_horde.py`).

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
| Basic Launch (the first submission) allows no ads | `prefetchAd` throws `adsDisabledBasicLaunch` there, so the lobby banner and break ads are left out and rewarded offers pay at once with no ad (the iOS ad-free card's wrapper, tracked as `free`), so Basic Launch players get the game as designed; the same bundle plays the ads once the game moves to Full Launch |
| Portal `muteAudio` takes priority | Holds every sound while set (`?muteAudio=true` checked) |
| English, SDK locale first | en and zh; the SDK locale is read before the browser's |
| Legible from 800×450 to 1920×1080; desktop landscape | Landscape play area, HUD in the corners, lobby spread across the width; the layout sweep checks 722×406 to 1920×1080 |
| No custom fullscreen button, no Escape, AZERTY-safe keys | None; movement reads physical key codes, so ZQSD works on AZERTY |
| No page scroll or selection, safe areas | Arrow keys are cancelled; `user-select` and `touch-action` are set in `index.html`; safe-area insets are respected |
| External links only in a new tab; a privacy notice for data beyond the SDK | The only link is the privacy policy (settings and the consent card), opened in a new tab; see "Privacy" below |
| Username shown, no login screen | The lobby header shows the SDK username; a guest on a page with accounts sees "Guest" and no leaderboard |

## Privacy

The game sends its own analytics, leaderboard runs (with the CrazyGames username) and problem
reports to hk.gamestao.com (server/README.md), so CrazyGames asks for a privacy notice. The policy
is served by the backend at https://hk.gamestao.com/privacy (`?lang=zh` for Chinese;
`server/src/privacy.{en,zh}.html`). The consent covers the statistics only; the rules are in
`client/src/meta/privacy.ts`, with as few taps as the law allows:

| Where | What the player sees | What is sent |
|---|---|---|
| EEA, UK, Switzerland (the portal's `countryCode`, else a `Europe/*` time zone) | Nothing during the first run; then a card at the foot of the lobby: Allow / No thanks / Privacy. It blocks nothing and stays until answered | No events until Allow: they wait on the device. No thanks drops them |
| Everywhere else | A toast over the first run, once (no tap): data is sent, turn it off in Settings | Everything, until switched off |

The leaderboards are part of the game the player plays (GDPR Art. 6(1)(b)), not its statistics: runs
and the board name go out whatever the consent says, unless the player turns the boards off
(Settings → Account & data → Leaderboards, on by default; `settings.boards`). A run the server has
not answered (offline, an adblocker) waits in the page's `hk.boardOutbox` and goes again every
minute and when a board opens (`net/boardOutbox.ts`). The results say why a run got no place (boards
off, waiting to be sent, could not be checked, a portal guest), and the board panel's foot why the
player's own row is missing (`board.pending` / `refused` / `queued` / `off`; the server marks a run
its re-simulation refused, `BoardReply.own`).

Settings → Account & data has the sharing switch, the leaderboards switch, the policy link and the
install's play ID (what a deletion request names; tapping it copies it where the host has a
clipboard, with a toast). A problem report is sent only when the player asks, so it always goes.
Offline builds and WeChat (no backend yet) show none of this.

Still to check on the portal itself: upload the zip to the developer portal's QA preview, then
watch a real ad fill, a signed-in save carry over between devices, and the leaderboard button
hidden for a guest (read from the SDK's `user.isUserAccountAvailable`).

## GameDistribution: Corgi Commando

Game 79693 on developer.gamedistribution.com, submitted for review 2026-10-29 as version 1.0
(review takes up to two weeks; once active a game can only be hidden, not withdrawn). The listing
reuses the corgi's CrazyGames texts in English, cut to GD's limits (description at most 500
characters, at most 5 tags) and without boards or cloud saves; genre Shooter, 1280x720, both
desktop and mobile, portrait preferred, No Blood and HTTPS Ready ticked. The five JPG thumbnails
(512x384, 512x512, 200x120, 1280x720, 1280x550) are cut from the corgi's draft covers by
`python tools/cover_corgi_gd.py` into `art/reskin/corgi/store/gamedistribution/`.

Upload: `npm run build:gamedistribution:new`, then zip `client/dist-gamedistribution-new` with
Python's zipfile, `index.html` at the root. GD counts the SDK as done only after an ad is watched
to its end in the upload page's test iframe: run `gdsdk.openConsole()` once on the revision URL
(it stores the debug flags for that origin), reopen the iframe, scroll it to the debug bar and
press Interstitial, then Rewarded (which ticks "Rewarded Ads"). Should review ask for an ad on
Play, the GD build gets a pre-roll of its own; until then it keeps the shared pacing.

## Newgrounds (dropped)

Published 2026-10-18 as portal/view/1057321 and un-published by staff a day later with no message
(the submission agreement bans games "generated via an AI prompt"; the sibling game funny went the
same way). Little traffic and the wrong audience, so the Newgrounds build was removed; its 15
installs stay in the backend's data, counted under all hosts.

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
> • 20 chapters across five lands lead from a ruined temple to Demon Peak, where the last enemy
>   is yourself. Three stars and a hard mode in every chapter.
> • Daily and weekly challenges, daily tasks, achievements and a codex to fill.
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
> • 20 章、五片地界，从荒寺一路打到魔窟，最后的敌人是你自己。每章三星评级，另有困难模式。
> • 每日、每周挑战，每日任务、成就，还有图鉴等你收集。
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
chapters in. These were taken from the dev build with Playwright at 430×932 and 3×, then scaled to App Store
Connect's 6.1"/6.3" iPhone size (1179×2556, the same aspect). `node tools/store_shots.mjs
<monk|corgi> <en|zh>` now takes such a set straight at 1179×2556 (393×852 at 3×): the balance bot
plays each scene (`?direct&autoplay&from=N&chapter=C&seed=S`) until its moment, the dev fps
readout is hidden and the page is captured; the lobby seeds a save two chapters in. A bot that
falls on the way fails the take, so it is run again with another `--seed`. `--only iap` takes
App Review's screenshot of the ad-free card (the Shop tab with `?store=fake`).

## App Store: Corgi Commando

The corgi reskin's own iPhone app (`docs/ios.md` "Second app: Corgi Commando"), to be entered a
few weeks after Holy Kicker's review is through. Against guideline 4.3 nothing here repeats Holy
Kicker's listing: its own name, icon, text, screenshots and privacy page. en-US is the primary
language and zh-Hans the second, as for Holy Kicker.

| Field | en-US | zh-Hans |
|---|---|---|
| Name (30) | Corgi Commando: Bug Blaster | 柯基突击队 |
| Subtitle (30) | Corgi trooper vs bug swarms | 单手割草，柯基大战外星虫群 |
| Keywords (100) | roguelite,horde,survivor,bullet heaven,dog,puppy,space,alien,shooter,offline,one hand,action,rpg | 割草,肉鸽,幸存者,弹幕,柯基,狗狗,小狗,太空,外星,虫子,射击,单机,离线,单手,动作,休闲 |
| Promotional text (170) | One thumb, one corgi, one ricochet blaster and a galaxy full of bugs. Pick your upgrades, evolve your gadgets and survive 50 waves. | 一根手指、一只柯基、一把弹射枪，对上满星系的虫子。三选一升级、进化装备，撑过 50 波！ |

Privacy policy `https://hk.gamestao.com/privacy?g=corgi` (Corgi Commando's own page, en and zh).
Support URL `https://gamestao.com/`, copyright `2026 Tao Wang`, category Games → Action and
Casual, free, every storefront but mainland China, as for Holy Kicker.

### Description

**en**

> Corgi Commando is a one-thumb horde survivor. Biscuit, a brave little corgi in space armour,
> lands on planets overrun by alien bugs, and every shot is automatic: you only steer.
>
> • Every level up, pick one of three upgrades: Orbital Strike, Tesla Coil, Saw Blades and more.
> • Max a gadget and pair it with the right passive to evolve it into something much bigger.
> • Survive 50 waves, elite bugs and two bosses to clear a planet.
> • Between runs, merge the gear you find, train at Boot Camp and unlock new weapons: a plasma
>   saber, a pulse emitter, orbit drones and a disc launcher, each of which changes how you play.
> • Recruit the squad: Brick the bouncy bulldog and Ginger the nimble cat fight their own way.
> • 20 planets' worth of missions across five worlds lead from the Frost Moon to the Hive Core,
>   where the last enemy is a robot copy of yourself. Three stars and a hard mode on every one.
> • Daily and weekly challenges, daily tasks, achievements and a codex to fill.
> • Plays offline, with no account and no sign-up. Climb each planet's leaderboard under your
>   Game Center nickname.
>
> Ads are optional videos for bonuses, plus a short break between runs. The one-time Ad-free card
> pays every ad reward at once and removes all ads; the daily limits stay the same.

**zh**

> 《柯基突击队》是一款单手操作的割草肉鸽游戏。勇敢的小柯基饼干穿上太空战甲，降落在被外星虫群
> 占领的星球上。射击全是自动的，你只管走位。
>
> • 每次升级三选一：轨道打击、特斯拉线圈、飞锯……
> • 把技能升满，再配上对应的被动强化，就能进化成更强的形态。
> • 撑过 50 波虫子、精英和两个 Boss，才算拿下一颗星球。
> • 局外合成装备、去训练营练兵、解锁新武器：等离子光剑、脉冲发射器、环绕无人机、飞盘发射器，
>   每件都会改变打法。
> • 招募小队：会弹人的斗牛犬砖头、身手轻盈的猫咪姜糖，各有各的打法。
> • 五颗星球、20 场任务，从冰霜月一路打到虫巢核心，最后的敌人是机器版的你自己。每关三星评级，另有困难模式。
> • 每日、每周挑战，每日任务、成就，还有图鉴等你收集。
> • 支持离线游玩，无需账号和注册。用 Game Center 昵称冲击每颗星球的排行榜。
>
> 广告都是可选的奖励视频，另有两局之间的短广告。一次性购买的去广告卡让所有广告奖励直接到账、
> 不再播放任何广告；每日次数上限不变。

### Review notes

> No account or sign-in is needed. The first launch goes straight into a short first run on the
> first planet: drag anywhere to move, attacks are automatic. When the run ends (or Pause → Give
> up), the lobby opens.
>
> In-app purchase: the Ad-free card (com.gamestao.corgi.adfree, non-consumable) is on the lobby's
> Shop tab, which is open from the first lobby, with Restore on the same card. It pays every
> rewarded-ad bonus at once and stops all ads; it unlocks nothing else.
>
> Ads: Google AdMob, rewarded videos for optional bonuses (double bolts after a run, a revive)
> and an interstitial between runs from the second run on. Non-personalised ads only; the app does
> not track, so there is no App Tracking Transparency prompt. Google's consent form appears in the
> EEA, the UK and Switzerland.
>
> Game Center is optional: when signed in, the nickname shows in the lobby and on the planet
> leaderboards; otherwise the game rolls a random name.

### Screenshots

Five per language in `art/reskin/corgi/ios/store/` (`en_*`, `zh_*`), 1179×2556, taken with
`node tools/store_shots.mjs corgi <en|zh>` from `npm run dev:new` (seed 7, but the Dune World
takes with `--only ch3 --seed 3`, as seed 7 falls on the way, and the English horde with `--seed 5`): a Frost Moon horde at wave 30, the level-up
cards, the wave 20 Twin Ram Beetles, Dune World at wave 12, and the lobby of a save two planets
in. App Review's purchase screenshot is `iap_adfree_review_en.png` (`--only iap`).
