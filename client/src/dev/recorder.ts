// Dev: records the game canvas to a video file for the store listing (?record=SECONDS).
// With ?record the web host draws a fixed 1080x1920 canvas (the phone layout, scaled to fit the
// window by CSS), so the file is exactly the store's portrait size whatever the window. The
// recording starts with the first run and stops after the given seconds, or on the R key,
// then the browser saves it. MP4 (H.264) where the browser can, WebM otherwise.

const TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

export function recordCanvas(canvas: HTMLCanvasElement, seconds: number, running: () => boolean): void {
  const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) {
    console.warn('record: this browser cannot record a canvas');
    return;
  }
  const wait = setInterval(() => {
    if (!running()) return;
    clearInterval(wait);
    start(canvas, type, seconds);
  }, 100);
}

function start(canvas: HTMLCanvasElement, type: string, seconds: number): void {
  const rec = new MediaRecorder(canvas.captureStream(60), { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type }));
    a.download = `holy-kicker-${Date.now()}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
    a.click();
    console.info(`record: saved ${a.download}`);
  };
  const stop = () => {
    if (rec.state === 'recording') rec.stop();
  };
  rec.start(1000);
  console.info(`record: recording ${seconds} s (${type}); R stops early`);
  setTimeout(stop, seconds * 1000);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') stop();
  });
}
