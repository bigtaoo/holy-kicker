"""Draw a split rig (split_parts.py output) in a pose: bones turned about their pivots.
usage: python pose_parts.py <parts dir> <rig.json> <out.png> [bone=degrees ...]
Degrees are clockwise on screen, as in a .tao clip (e.g. arm_f=-74 arm_n=74 lowers both arms
as the idle clip does). A bone turns its children with it (rig.json's parent map). The pose is
drawn over white at the parts' canvas size, ready for pack_icons.py (the hero portraits)."""
import json
import math
import sys
from pathlib import Path

from PIL import Image


def chain(name, parent):
    """The bone and its ancestors, from the bone up to the root."""
    out = []
    while name:
        out.append(name)
        name = parent.get(name)
    return out


def pose(parts_dir, rig_path, turns):
    parts_dir = Path(parts_dir)
    meta = json.loads((parts_dir / "parts.json").read_text())["parts"]
    parent = json.loads(Path(rig_path).read_text())["parent"]
    pivots = {p["name"]: p["pivot"] for p in meta}
    size = Image.open(parts_dir / "preview.png").size
    canvas = Image.new("RGBA", (size[0] // 3, size[1]), (255, 255, 255, 255))
    for p in meta:
        im = Image.open(parts_dir / f"{p['name']}.png").convert("RGBA")
        layer = Image.new("RGBA", canvas.size)
        layer.alpha_composite(im, (p["x"], p["y"]))
        # rest -> posed is the child's turn first, then each ancestor's; PIL wants posed -> rest
        a, b, c, d, e, f = 1, 0, 0, 0, 1, 0  # posed -> rest, as x' = a x + b y + c, y' = d x + e y + f
        for bone in reversed(chain(p["name"], parent)):
            deg = turns.get(bone, 0)
            if not deg:
                continue
            t = math.radians(deg)
            px, py = pivots[bone]
            cos, sin = math.cos(t), math.sin(t)
            # the inverse turn about the pivot, applied after what is already there
            ra, rb, rd, re = cos, sin, -sin, cos
            rc, rf = px - ra * px - rb * py, py - rd * px - re * py
            a, b, c, d, e, f = (ra * a + rb * d, ra * b + rb * e, ra * c + rb * f + rc,
                                rd * a + re * d, rd * b + re * e, rd * c + re * f + rf)
        if (a, b, c, d, e, f) != (1, 0, 0, 0, 1, 0):
            layer = layer.transform(canvas.size, Image.AFFINE, (a, b, c, d, e, f), Image.BICUBIC)
        canvas.alpha_composite(layer)
    return canvas


if __name__ == "__main__":
    turns = {k: float(v) for k, v in (arg.split("=") for arg in sys.argv[4:])}
    pose(sys.argv[1], sys.argv[2], turns).convert("RGB").save(sys.argv[3])
