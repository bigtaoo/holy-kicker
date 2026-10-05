# Store covers

Key art for the CrazyGames covers (`docs/store.md` "Images"). `edit_image` keeps the input's aspect
ratio, so each cover is an edit of a canvas already at its shape with the monk and the cuju placed
on it (`python tools/cover_ref.py art/monk/store` writes `ref_*.png`):

    bash tools/edit_image.sh art/monk/store/ref_landscape.png art/monk/store/cover_landscape.png art/monk/store/cover_landscape.txt

The pictures carry no text; the logo (`logo_en.png`, `logo_zh.png`, lettered by
`python tools/make_logo.py art/monk/store`) is laid over them and each is cropped to 1920×1080,
800×1200 and 800×800 by `python tools/cover_final.py art/monk/store en` (or `zh`), into `final/`.

Round 1 (`r1/*_fire.png`) edited the plain 4:3 hero picture: every cover came out 4:3, and a
"glowing golden-red ball" became a fireball. The prompts now describe the real ball (cream leather,
red cords, "not fire") and the ball is already on the canvas.

The landscape boss first came out with a topknot and brown skin (`r1/cover_landscape_topknot.png`);
`cover_landscape.png` is that cover edited with `cover_landscape_boss.txt` into a bald, grey-blue
fallen monk.
