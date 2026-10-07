// Dev: records the game canvas to a video file for the store listing (?record=SECONDS).
// With ?record the web host draws a fixed canvas at the video's size (scaled to fit the window
// by CSS), so the file is exactly that size whatever the window: ?shape=phone (1080x1920, the
// default), portrait (1080x1620, CrazyGames' 2:3) or landscape (1920x1080, which widens the view
// past the game's 3:4 cap). The recording starts with the first run and stops after the given
// seconds, or on the R key, then the browser saves it. MP4 (H.264) where the browser can, WebM
// otherwise. tools/store_video.py turns the recordings into the store's files.

const SHAPES = {
  phone: { width: 1080, height: 1920 },
  portrait: { width: 1080, height: 1620 },
  landscape: { width: 1920, height: 1080 },
};

/** The canvas size a ?record run draws at; null when not recording. */
export function recordSize(query: string): { width: number; height: number } | null {
  const q = new URLSearchParams(query);
  if (!import.meta.env.DEV || !q.has('record')) return null;
  return SHAPES[q.get('shape') as keyof typeof SHAPES] ?? SHAPES.phone;
}

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
  const rec = new MediaRecorder(canvas.captureStream(60), { mimeType: type, videoBitsPerSecond: 16_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type }));
    a.download = `holy-kicker-${canvas.width}x${canvas.height}-${Date.now()}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
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
