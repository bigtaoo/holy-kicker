"""Builds the reference canvases for the store covers: edit_image keeps the input's aspect ratio,
so each cover is an edit of a canvas already at its target shape, with the monk and the cuju
placed where the picture wants them (the prompt alone drew a fireball instead of the ball).
usage: python cover_ref.py <out dir>   (writes ref_landscape.png, ref_portrait.png, ref_square.png)"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from cutout import cutout  # noqa: E402

ART = Path(__file__).parent.parent / "art" / "monk" / "rig"
SKY = (24, 58, 72, 255)

# name: canvas size, monk (centre x, centre y, height), ball (centre x, centre y, diameter), all
# as fractions of the canvas height except the centres, which are fractions of width / height
LAYOUTS = {
    "landscape": ((1456, 816), (0.27, 0.58, 0.78), (0.47, 0.50, 0.17)),
    "portrait": ((832, 1248), (0.42, 0.70, 0.52), (0.64, 0.42, 0.12)),
    "square": ((1024, 1024), (0.42, 0.52, 0.80), (0.74, 0.58, 0.20)),
}


def place(page, im, cx, cy, h):
    im = im.crop(im.getbbox())
    k = h * page.height / im.height
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    page.alpha_composite(im, (round(cx * page.width - im.width / 2), round(cy * page.height - im.height / 2)))


def main():
    out = Path(sys.argv[1])
    monk = cutout(str(ART / "hero_apose_v3.png"))
    ball = Image.open(ART / "cuju_cut.png").convert("RGBA")
    for name, (size, m, b) in LAYOUTS.items():
        page = Image.new("RGBA", size, SKY)
        place(page, monk, *m)
        place(page, ball, *b)
        page.convert("RGB").save(out / f"ref_{name}.png")
        print(out / f"ref_{name}.png", size)


if __name__ == "__main__":
    main()
