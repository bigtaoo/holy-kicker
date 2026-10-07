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
| Gameplay video (optional) | 1080×1920, 15–20 s | A late-wave screen full of mobs, an evolution card, the boss |

**Recording the video**: run the dev server (`npm run dev`) and open, in Chrome,
`http://localhost:5174/?direct&autoplay&record=20&chapter=1&wave=38&sutras&quality=high&seed=7`.
`autoplay` lets the balance bot play (the level-up cards stay up 1.3 s, so they show),
`record=20` draws a fixed 1080×1920 canvas and saves 20 s of the run as MP4 (WebM where the
browser has no H.264); R stops early. Keep the tab in front: a hidden tab stops drawing. Try
other `seed`, `wave`, `chapter` and `relic` values for a fuller screen or a boss (wave 50).

Covers are painted key art in the game's sticker style (see `docs/content.md` and
`art/monk/`), not cropped gameplay: a portrait game screen does not fill a 16:9 cover.

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
| Portal `muteAudio` takes priority | Holds every sound while set (`?muteAudio=true` checked) |
| English, SDK locale first | en and zh; the SDK locale is read before the browser's |
| Legible from 800×450 to 1920×1080; desktop landscape | Portrait 3:4 play area with side bars; HUD and lobby text are readable at 800×450 |
| No custom fullscreen button, no Escape, AZERTY-safe keys | None; movement reads physical key codes, so ZQSD works on AZERTY |
| No page scroll or selection, safe areas | Arrow keys are cancelled; `user-select` and `touch-action` are set in `index.html`; safe-area insets are respected |
| No external links; no personal data collected | None; the save is the SDK data module |
| Username shown, no login screen | The lobby header shows the SDK username; a guest on a page with accounts sees "Guest" and no leaderboard |

Still to check on the portal itself: upload the zip to the developer portal's QA preview, then
watch a real ad fill, a signed-in save carry over between devices, and the leaderboard button
hidden for a guest (read from the SDK's `user.isUserAccountAvailable`).
