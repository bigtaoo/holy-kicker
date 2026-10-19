"""Write a lossy WebP beside each first-screen PNG listed in client/src/webpArt.json.
usage: python tools/webp.py [png ...]
With paths, writes the twin of just those PNGs (a reskin's sheets, which live outside public).
The web builds load the .webp where the browser decodes it (art.ts) and the PNG otherwise, so
rerun this after re-exporting any listed PNG. Only full-colour sheets are listed: the palette
PNGs (mobs, icons, decoration) come out bigger as WebP. Colour at quality 90, alpha lossless."""
import json
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "client")
LIST = os.path.join(ROOT, "src", "webpArt.json")


def twin(src, label):
    dst = src[: -len(".png")] + ".webp"
    im = Image.open(src).convert("RGBA")
    im.save(dst, "WEBP", quality=90, method=6, alpha_quality=100)
    print(f"{label}: {os.path.getsize(src) // 1024} KB -> {os.path.getsize(dst) // 1024} KB")


def main():
    if sys.argv[1:]:
        for src in sys.argv[1:]:
            twin(src, src)
        return
    for rel in json.load(open(LIST, encoding="utf-8")):
        twin(os.path.join(ROOT, "public", rel), rel)


if __name__ == "__main__":
    main()
