"""
Habillage de screenshots Android en format Play Store.
Usage:
    python3 frame_screenshots.py <capture.png> "Titre marketing"
Sortie: screenshots/framed_<n>_<slug>.png (1080x1920)
"""
import sys, re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
ORANGE = (245, 103, 20)
ORANGE_DARK = (200, 70, 10)
WHITE = (255, 255, 255)
INK = (30, 20, 10)

HERE = Path(__file__).parent
OUT_DIR = HERE / "screenshots"
OUT_DIR.mkdir(exist_ok=True)

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def gradient(size, c1, c2):
    w, h = size
    img = Image.new("RGB", size, c1)
    top = Image.new("RGB", size, c2)
    mask = Image.new("L", size)
    px = mask.load()
    for y in range(h):
        v = int(255 * y / h)
        for x in range(w):
            px[x, y] = v
    img.paste(top, (0, 0), mask)
    return img

def slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s[:40] or "shot"

def frame(capture_path: Path, title: str, index: int):
    bg = gradient((W, H), ORANGE, ORANGE_DARK)
    draw = ImageDraw.Draw(bg, "RGBA")

    for i, r in enumerate([420, 300, 180]):
        alpha = 22 - i * 5
        draw.ellipse((W - r, -r // 2, W + r, r + r // 2), fill=(255, 255, 255, alpha))

    font_title = ImageFont.truetype(FONT_BOLD, 68)
    tw = draw.textlength(title, font=font_title)
    if tw > W - 100:
        font_title = ImageFont.truetype(FONT_BOLD, 56)
        tw = draw.textlength(title, font=font_title)
    tx = (W - tw) // 2
    ty = 110
    draw.text((tx + 3, ty + 3), title, font=font_title, fill=(0, 0, 0, 90))
    draw.text((tx, ty), title, font=font_title, fill=WHITE)

    cap = Image.open(capture_path).convert("RGB")
    target_h = 1500
    ratio = target_h / cap.height
    target_w = int(cap.width * ratio)
    cap = cap.resize((target_w, target_h), Image.LANCZOS)

    radius = 42
    mask = Image.new("L", (target_w, target_h), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle((0, 0, target_w, target_h), radius=radius, fill=255)

    shadow_pad = 30
    shadow = Image.new("RGBA", (target_w + shadow_pad * 2, target_h + shadow_pad * 2), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((shadow_pad, shadow_pad, target_w + shadow_pad, target_h + shadow_pad),
                            radius=radius, fill=(0, 0, 0, 130))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))

    cx = (W - target_w) // 2
    cy = 260
    bg.paste(shadow, (cx - shadow_pad, cy - shadow_pad + 10), shadow)
    bg.paste(cap, (cx, cy), mask)

    border = Image.new("RGBA", (target_w + 8, target_h + 8), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(border)
    bdraw.rounded_rectangle((0, 0, target_w + 8, target_h + 8), radius=radius + 4,
                            outline=(255, 255, 255, 200), width=4)
    bg.paste(border, (cx - 4, cy - 4), border)

    out = OUT_DIR / f"framed_{index:02d}_{slug(title)}.png"
    bg.save(out, "PNG", optimize=True)
    print(f"OK -> {out}")
    return out

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 frame_screenshots.py <capture.png> \"Titre\" [index]")
        sys.exit(1)
    idx = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    frame(Path(sys.argv[1]), sys.argv[2], idx)
