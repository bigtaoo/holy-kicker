"""Write a WebP beside each first-screen PNG listed in client/src/webpArt.json.
usage: python tools/webp.py [png ...]
With paths, writes the twin of just those PNGs (a reskin's sheets, which live outside public);
a path ending in a "lossless" entry's path gets a lossless twin.
The web builds load the .webp where the browser decodes it (art.ts) and the PNG otherwise, so
rerun this after re-exporting any listed PNG. "lossy": full-colour sheets, colour at quality 90,
alpha lossless. "lossless": the palette sheets a first run waits on (lossy WebP comes out bigger
than their PNG), pixel for pixel the PNG; the script checks that."""
import json
import os
import sys
from PIL import Image, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), "..", "client")
LIST = json.load(open(os.path.join(ROOT, "src", "webpArt.json"), encoding="utf-8"))


def twin(src, label, lossless):
    dst = src[: -len(".png")] + ".webp"
    im = Image.open(src).convert("RGBA")
    if lossless:
        # exact=True keeps the colour under fully transparent pixels, so even those match
        im.save(dst, "WEBP", lossless=True, quality=100, method=6, exact=True)
        back = Image.open(dst).convert("RGBA")
        if back.size != im.size or ImageChops.difference(back, im).getbbox() is not None:
            sys.exit(f"{label}: the lossless WebP does not decode to the PNG")
    else:
        im.save(dst, "WEBP", quality=90, method=6, alpha_quality=100)
    kind = "lossless" if lossless else "q90"
    print(f"{label}: {os.path.getsize(src) // 1024} KB -> {os.path.getsize(dst) // 1024} KB ({kind})")


def main():
    lossless = [p.replace("/", os.sep) for p in LIST["lossless"]]
    if sys.argv[1:]:
        for src in sys.argv[1:]:
            twin(src, src, any(os.path.normpath(src).endswith(p) for p in lossless))
        return
    for kind in ("lossy", "lossless"):
        for rel in LIST[kind]:
            twin(os.path.join(ROOT, "public", rel), rel, kind == "lossless")


if __name__ == "__main__":
    main()
