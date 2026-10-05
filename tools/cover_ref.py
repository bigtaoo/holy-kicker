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

# monk poses: file in ART, whether the picture has a painted ground shadow under the figure to drop
POSES = {"apose": ("hero_apose_v3.png", False), "kick": ("hero_kick_v1.png", True)}

# name: canvas size, pose, monk (centre x, centre y, height), ball (centre x, centre y, diameter),
# all as fractions of the canvas height except the centres, which are fractions of width / height
LAYOUTS = {
    "landscape": ((1456, 816), "apose", (0.27, 0.58, 0.78), (0.47, 0.50, 0.17)),
    "portrait": ((832, 1248), "kick", (0.45, 0.68, 0.46), (0.83, 0.53, 0.12)),
    "square": ((1024, 1024), "kick", (0.44, 0.42, 0.62), (0.80, 0.26, 0.15)),
}


def drop_shadow(im):
    """Cuts a cutout at its first empty row, dropping a ground shadow painted apart below the figure."""
    a = im.getchannel("A")
    for y in range(im.height):
        if a.crop((0, y, im.width, y + 1)).getbbox() is None:
            return im.crop((0, 0, im.width, y))
    return im


def place(page, im, cx, cy, h):
    im = im.crop(im.getbbox())
    k = h * page.height / im.height
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    page.alpha_composite(im, (round(cx * page.width - im.width / 2), round(cy * page.height - im.height / 2)))


def main():
    out = Path(sys.argv[1])
    ball = Image.open(ART / "cuju_cut.png").convert("RGBA")
    for name, (size, pose, m, b) in LAYOUTS.items():
        file, shadow = POSES[pose]
        monk = cutout(str(ART / file))
        if shadow:
            monk = drop_shadow(monk)
        page = Image.new("RGBA", size, SKY)
        place(page, monk, *m)
        place(page, ball, *b)
        page.convert("RGB").save(out / f"ref_{name}.png")
        print(out / f"ref_{name}.png", size)


if __name__ == "__main__":
    main()
