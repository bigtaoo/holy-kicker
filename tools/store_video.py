"""Cuts a CrazyGames preview video from a raw recording (tools/record_video.mjs).
usage: python store_video.py <landscape|portrait> <raw video> <start seconds> [en|zh]
Writes art/monk/store/video/<lang>_<shape>.mp4: the store cover as a still for the first second
(the portal asks for the cover as the opening frame), then a hard cut to the recording from
<start> on, 20 s in all, no sound, H.264 (CRF 23) at 60 fps with the index up front (docs/store.md "Video").
The cover is drawn at the video's size by cover_final.py, so it matches the static cover."""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

from cover_final import COVERS, cover

STORE = Path(__file__).resolve().parent.parent / "art" / "monk" / "store"
SIZES = {"landscape": (1920, 1080), "portrait": (1080, 1620)}
STILL = 1.0
LENGTH = 20.0


def main():
    if len(sys.argv) < 4 or sys.argv[1] not in SIZES:
        sys.exit(__doc__)
    shape, raw, start = sys.argv[1], sys.argv[2], float(sys.argv[3])
    lang = sys.argv[4] if len(sys.argv) > 4 else "en"
    w, h = SIZES[shape]
    _, focus, place = COVERS[shape]
    logo = Image.open(STORE / f"logo_{lang}.png").convert("RGBA")
    out = STORE / "video" / f"{lang}_{shape}.mp4"
    out.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        still = Path(tmp) / "cover.png"
        cover(STORE / f"cover_{shape}.png", logo, (w, h), focus, place).save(still)
        graph = (
            f"[0:v]scale={w}:{h},setsar=1,fps=60,format=yuv420p[a];"
            f"[1:v]scale={w}:{h}:flags=lanczos,setsar=1,fps=60,format=yuv420p[b];"
            "[a][b]concat=n=2:v=1:a=0[v]"
        )
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y",
             "-loop", "1", "-t", str(STILL), "-i", str(still),
             "-ss", str(start), "-t", str(LENGTH - STILL), "-i", raw,
             "-filter_complex", graph, "-map", "[v]", "-an",
             "-t", str(LENGTH), "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-movflags", "+faststart", str(out)],
            check=True,
        )
    print(out, f"{w}x{h}", f"{out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
