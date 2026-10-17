"""Write a lossy WebP beside each first-screen PNG listed in client/src/webpArt.json.
usage: python tools/webp.py
The web builds load the .webp where the browser decodes it (art.ts) and the PNG otherwise, so
rerun this after re-exporting any listed PNG. Only full-colour sheets are listed: the palette
PNGs (mobs, icons, decoration) come out bigger as WebP. Colour at quality 90, alpha lossless."""
import json
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "client")
LIST = os.path.join(ROOT, "src", "webpArt.json")


def main():
    for rel in json.load(open(LIST, encoding="utf-8")):
        src = os.path.join(ROOT, "public", rel)
        dst = src[: -len(".png")] + ".webp"
        im = Image.open(src).convert("RGBA")
        im.save(dst, "WEBP", quality=90, method=6, alpha_quality=100)
        print(f"{rel}: {os.path.getsize(src) // 1024} KB -> {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    main()
