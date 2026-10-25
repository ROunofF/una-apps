#!/usr/bin/env python3
"""Put 240x240 UNA Watch screenshots into the official watch renders.

    py -3 tools/make-mockups.py <screenshots dir> <out dir> [--body white|black|teal]
                                [--hero a.png,b.png,c.png] [--sdk PATH] [--look raw|watch]

--look watch tones each screenshot toward how the real watch panel looks
(lifted blue-grey blacks, dimmer whites, about half the saturation). The
simulator shows the app's colours at full strength, which the panel can't.

The watch renders come from the UNA SDK's Figma UI kit
(una-sdk/Docs/Templates/Figma-UI-Kit/UNA-Watch-UI-Resource-Pack.fig, a zip).
Each render is 2000x2000 with a transparent screen hole centred at
(999.5, 1010.5), about 734 px across.

Writes <out>/<name>.png (600 px wide) for every PNG/BMP in <screenshots dir>.
With --hero, also writes hero_3_watches.png: the middle screenshot on the
chosen body in front, the other two smaller on the other two bodies.
Needs Pillow (pip install pillow).
"""
import argparse
import io
import os
import zipfile
from pathlib import Path

from PIL import Image, ImageEnhance

# How the real panel renders the app's colours, measured on a video of a
# UNA watch (dark screen, white digits, teal arc): black shows as dark
# blue-grey, white peaks well below 255, and colours keep ~45% saturation.
# Predicts simulator teal (0,170,170) as (75,123,129); the video shows (79,119,123).
WATCH_SATURATION = 0.45
WATCH_BLACK = (36, 38, 44)
WATCH_WHITE = (188, 190, 196)


def watch_look(img: Image.Image) -> Image.Image:
    """Simulator screenshot -> roughly what the watch panel shows."""
    rgb = ImageEnhance.Color(img.convert("RGB")).enhance(WATCH_SATURATION)
    bands = [b.point(lambda v, lo=lo, hi=hi: round(lo + (hi - lo) * v / 255))
             for b, lo, hi in zip(rgb.split(), WATCH_BLACK, WATCH_WHITE)]
    out = Image.merge("RGB", bands)
    if img.mode == "RGBA":
        out.putalpha(img.getchannel("A"))
    return out

# The renders inside the .fig zip, by the end of their file name.
SUFFIX ={"black": "7214c36d", "white": "fc144d36", "teal": "f66563f5"}
CX, CY, D = 999.5, 1010.5, 744          # screen hole centre and the size to scale the screen to
CROP = (400, 180, 1600, 1815)           # the watch body inside the 2000x2000 render


def load_bodies(sdk: Path) -> dict:
    fig = sdk / "Docs/Templates/Figma-UI-Kit/UNA-Watch-UI-Resource-Pack.fig"
    z = zipfile.ZipFile(fig)
    bodies = {}
    for colour, suffix in SUFFIX.items():
        name = next(n for n in z.namelist() if n.endswith(suffix))
        bodies[colour] = Image.open(io.BytesIO(z.read(name))).convert("RGBA")
    return bodies


LOOK = "raw"   # set from --look


def mock(screen: Path, body: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (2000, 2000), (0, 0, 0, 0))
    s = Image.open(screen).convert("RGBA")
    if LOOK == "watch":
        s = watch_look(s)
    s = s.resize((D, D), Image.LANCZOS)
    canvas.paste(s, (int(CX - D / 2), int(CY - D / 2)))
    canvas.alpha_composite(body)
    return canvas.crop(CROP)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("shots", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--body", default="white", choices=SUFFIX)
    ap.add_argument("--hero", help="three screenshot file names, comma separated")
    ap.add_argument("--sdk", type=Path,
                    default=Path(os.environ.get("UNA_SDK", Path.home() / "STM32Cube/una-sdk")))
    ap.add_argument("--look", default="raw", choices=("raw", "watch"),
                    help="watch = tone the screens like the real panel (see watch_look)")
    a = ap.parse_args()
    global LOOK
    LOOK = a.look
    bodies = load_bodies(a.sdk)
    a.out.mkdir(parents=True, exist_ok=True)

    for p in sorted(a.shots.iterdir()):
        if p.suffix.lower() not in (".png", ".bmp"):
            continue
        m = mock(p, bodies[a.body])
        m.resize((600, round(600 * m.height / m.width)), Image.LANCZOS).save(a.out / (p.stem + ".png"))
        print("wrote", a.out / (p.stem + ".png"))

    if a.hero:
        left, mid, right = [a.shots / n for n in a.hero.split(",")]
        others = [c for c in SUFFIX if c != a.body]
        c = mock(mid, bodies[a.body])
        W, H = c.size
        side = [mock(left, bodies[others[0]]), mock(right, bodies[others[1]])]
        side = [s.resize((int(W * 0.85), int(H * 0.85)), Image.LANCZOS) for s in side]
        hero = Image.new("RGBA", (int(W * 2.3), H), (0, 0, 0, 0))
        y = (H - side[0].height) // 2
        hero.alpha_composite(side[0], (0, y))
        hero.alpha_composite(side[1], (hero.width - side[1].width, y))
        hero.alpha_composite(c, ((hero.width - W) // 2, 0))
        hero = hero.resize((1600, round(1600 * hero.height / hero.width)), Image.LANCZOS)
        hero.save(a.out / "hero_3_watches.png")
        print("wrote", a.out / "hero_3_watches.png")


if __name__ == "__main__":
    main()
