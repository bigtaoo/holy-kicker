"""The corgi's CrazyGames covers: its gameplay covers (draft_<shape>.png, tools/cover_corgi_horde.py,
the ones on its Playgama app) cut to the store sizes of cover_final.py, with no logo (the corgi has none).
usage: python tools/cover_corgi_final.py
Writes art/reskin/corgi/store/final/en_{landscape,portrait,square}.png (docs/store.md "Images")."""
from pathlib import Path

from cover_final import COVERS, cover

STORE = Path(__file__).resolve().parent.parent / "art" / "reskin" / "corgi" / "store"


def main():
    out = STORE / "final"
    out.mkdir(exist_ok=True)
    for name, (size, focus, _) in COVERS.items():
        cover(STORE / f"draft_{name}.png", None, size, focus, None).save(out / f"en_{name}.png", optimize=True)
        print(out / f"en_{name}.png", size)


if __name__ == "__main__":
    main()
