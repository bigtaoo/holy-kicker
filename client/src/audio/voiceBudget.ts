// The cap on voices sounding at once (adapted from D:\daydayup's audio/VoiceBudget.ts). Pure
// bookkeeping with plain numbers. Voices retire by time, not by an `ended` event: every claim
// says when its voice finishes, so the cap cannot get stuck on a runtime (WeChat) whose
// events are unverified.

interface LiveVoice {
  priority: number;
  /** Context time (seconds) at which the voice is silent. */
  until: number;
  stop(): void;
}

export class VoiceBudget {
  private readonly live: LiveVoice[] = [];

  constructor(private readonly cap: number) {}

  /**
   * A slot at `now` for a voice of `priority` lasting until `until`. When the cap is full the
   * weakest voice is stopped if the newcomer outranks it (oldest first among equals);
   * otherwise false and nothing should play. Equal priority does not steal: that would only
   * trade one hit for a clipped one.
   */
  claim(priority: number, now: number, until: number, stop: () => void): boolean {
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].until <= now) this.live.splice(i, 1);
    }
    if (this.live.length >= this.cap) {
      if (this.live.length === 0) return false;
      let weakest = 0;
      for (let i = 1; i < this.live.length; i++) {
        if (this.live[i].priority < this.live[weakest].priority) weakest = i;
      }
      if (this.live[weakest].priority >= priority) return false;
      this.live[weakest].stop();
      this.live.splice(weakest, 1);
    }
    this.live.push({ priority, until, stop });
    return true;
  }

  get held(): number {
    return this.live.length;
  }
}
