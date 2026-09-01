from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 1024, 500
ORANGE = (245, 103, 20)          # #F56714
ORANGE_DARK = (200, 70, 10)
ORANGE_LIGHT = (255, 150, 70)
WHITE = (255, 255, 255)
INK = (35, 20, 10)

HERE = Path(__file__).parent
LOGO = HERE.parent / "assets" / "logo.png"
OUT = HERE / "feature-graphic-1024x500.png"

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"

def diagonal_gradient(size, c1, c2):
    w, h = size
    base = Image.new("RGB", size, c1)
    top = Image.new("RGB", size, c2)
    mask = Image.new("L", size)
    px = mask.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h)
            px[x, y] = int(255 * t)
    base.paste(top, (0, 0), mask)
    return base

img = diagonal_gradient((W, H), ORANGE, ORANGE_DARK)
draw = ImageDraw.Draw(img, "RGBA")

for i, r in enumerate([260, 200, 140]):
    alpha = 25 - i * 5
    draw.ellipse((W - r, -r // 2, W + r, r + r // 2), fill=(255, 255, 255, alpha))
for i, r in enumerate([220, 160, 100]):
    alpha = 20 - i * 4
    draw.ellipse((-r // 2, H - r // 2, r + r // 2, H + r // 2), fill=(255, 255, 255, alpha))

logo = Image.open(LOGO).convert("RGBA")
logo_w = 620
logo_h = int(logo.height * (logo_w / logo.width))
logo = logo.resize((logo_w, logo_h), Image.LANCZOS)

r, g, b, a = logo.split()
white_logo = Image.merge("RGBA", (
    Image.new("L", logo.size, 255),
    Image.new("L", logo.size, 255),
    Image.new("L", logo.size, 255),
    a,
))

logo_x = (W - logo_w) // 2
logo_y = 110
img.paste(white_logo, (logo_x, logo_y), white_logo)

tagline = "Ta boutique en ligne, simple et rapide"
font_tag = ImageFont.truetype(FONT_BOLD, 38)
tw = draw.textlength(tagline, font=font_tag)
tx = (W - tw) // 2
ty = logo_y + logo_h + 40
draw.text((tx + 2, ty + 2), tagline, font=font_tag, fill=(0, 0, 0, 90))
draw.text((tx, ty), tagline, font=font_tag, fill=WHITE)

img.save(OUT, "PNG", optimize=True)
print(f"OK -> {OUT} ({W}x{H})")
