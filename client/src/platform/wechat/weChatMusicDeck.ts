import type { MusicDeck } from '../../audio/music';

// A WeChat music deck (adapted from daydayup platform/wechat/weChatMusicDeck.ts): a long-lived
// InnerAudioContext, the runtime's streaming player. It has no audio graph, so the level is
// written straight into .volume. The file sits in the 'audio' subpackage, which Sound loads
// (Platform.loadPack) before it asks for any track.
export class WeChatMusicDeck implements MusicDeck {
  private readonly inner: WxInnerAudioContext;
  private playing = false;
  private src = '';

  constructor(create: () => WxInnerAudioContext) {
    this.inner = create();
    this.inner.loop = false;
    this.inner.obeyMuteSwitch = true;
    this.inner.volume = 0;
    this.inner.onError((res) => {
      this.playing = false;
      console.warn(`music: ${this.src} failed`, res?.errMsg ?? res);
    });
  }

  play(path: string): void {
    if (path !== this.src) {
      this.src = path;
      this.inner.src = path;
    } else {
      this.inner.stop(); // rewinds
    }
    this.playing = true;
    this.inner.play();
  }

  setLevel(level: number): void {
    this.inner.volume = level;
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.inner.stop();
  }

  position(): number | null {
    const t = this.inner.currentTime;
    return this.playing && Number.isFinite(t) ? t : null;
  }

  setPaused(paused: boolean): void {
    if (!this.playing) return;
    if (paused) this.inner.pause();
    else this.inner.play();
  }
}
