# Sharing the speaker

Holy Kicker never stops the player's own music (Spotify, Apple Music, a YouTube tab). The game's
sound plays alongside it, and where the host can tell that other music is playing, the game's
music makes way.

## Why the game used to stop it

Until October 2026 the web music streamed from an `<audio>` element routed into Web Audio. A
playing media element claims the phone's media focus: Android Chrome pauses Spotify and other
tabs for it, Safari and WKWebView switch the audio session to playback (which stops the music app
even inside the iOS app, whose shell asks for `.ambient`), and desktop Chrome hands the keyboard's
media keys to the game. Web Audio alone claims none of these.

## Per host

| Host | Mixes how | Knows other music plays? | What the game does then |
| --- | --- | --- | --- |
| Web (h.gamestao.com, CrazyGames, Playgama) | Music decoded and played by Web Audio buffer sources (`platform/web/webMusicDeck.ts`, `musicBuffers.ts`); Safari 16.4+ also gets `navigator.audioSession.type = 'ambient'` | No: browsers have no such signal | Nothing: the game's music plays at the player's music setting (they can turn it down or off in settings) |
| iOS app | `AVAudioSession` `.ambient` (AppDelegate) and the page's `'ambient'` audio session; music through Web Audio as on the web | Yes: `secondaryAudioShouldBeSilencedHint`, pushed through the bridge (v7, `platform/ios/otherAudio.ts`) | The game's music fades out and stops; the effects play at 60% of their level. Both come back when the other music stops |
| WeChat | `wx.setInnerAudioOption({ mixWithOther: true, obeyMuteSwitch: true })` before the first sound | No API for it | Nothing, as on the web |

`'ambient'` (and `.ambient` on iOS) also means the iPhone's silent switch silences the game, as
for most games; Safari on the web did that already for Web Audio alone.

The settings volumes are never changed: the ducking lives in `audio/Sound.ts` (`otherAudio`), on
top of the player's levels.

## Memory

Decoded music is big (a minute of stereo is about 25 MB at 48 kHz), so `MusicBuffers` decodes at
32 kHz through an `OfflineAudioContext` (falling back to the playing context's rate), holds a
track only while a deck plays it, and keeps the compressed files (about 1 MB each) so a track comes
back without another download. Steady state is one track: at most about 28 MB (the 108 s boss
track), two tracks during a 2 s crossfade.

## Checked only on a device

- iPhone, Safari and the app: Spotify or Apple Music keeps playing when the game starts and through
  a run; in the app the game's music fades out while it plays and comes back when it is paused.
  The hint needs a TestFlight build with bridge v7; older shells mix but do not duck.
- Android Chrome: Spotify and a YouTube tab keep playing; the game's music and effects play over them.
- WeChat (iOS and Android): QQ Music or Spotify keeps playing under the game.
- After a call and after an ad, the music comes back on every host.
