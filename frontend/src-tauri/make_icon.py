"""
Generate a 1024x1024 ChefOS app-icon source PNG (a chef's toque in the brand
colors). Run, then feed the result to Tauri:

    py make_icon.py
    npm run tauri icon icon-source.png

Replace icon-source.png with your own logo any time and re-run `tauri icon`.
"""
from PIL import Image, ImageDraw

SIZE = 1024
RUBY = (108, 11, 37, 255)      # #6C0B25  background
CREAM = (250, 247, 231, 255)   # #FAF7E7  hat
ESPRESSO = (46, 26, 14, 255)   # #2E1A0E  pleats

img = Image.new("RGBA", (SIZE, SIZE), RUBY)
d = ImageDraw.Draw(img)

# Rounded-square background already filled with RUBY; soften corners by masking.
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE, SIZE], radius=190, fill=255)
bg = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bg.paste(img, (0, 0), mask)
img = bg
d = ImageDraw.Draw(img)

# ── Chef's hat (toque) in cream ──
# Body connecting the puffs down to the band
d.rectangle([360, 440, 664, 660], fill=CREAM)
# Puffs
d.ellipse([286, 326, 506, 560], fill=CREAM)   # left
d.ellipse([518, 326, 738, 560], fill=CREAM)   # right
d.ellipse([378, 286, 646, 552], fill=CREAM)   # top centre
# Band (brim)
d.rounded_rectangle([322, 632, 702, 762], radius=26, fill=CREAM)

# Pleat lines on the band
for x in (412, 512, 612):
    d.line([(x, 648), (x, 746)], fill=ESPRESSO, width=10)

img.save("icon-source.png")
print("Wrote icon-source.png (1024x1024)")
