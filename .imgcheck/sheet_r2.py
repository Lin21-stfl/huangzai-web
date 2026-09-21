import os
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:\Users\LQT\Desktop\三下乡\网页设计\Xin\.imgcheck"
COLS, CELL, PAD, LABEL_H = 5, 300, 6, 26

def font(size=18):
    for p in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def stem(k):
    return k[:-4] if k.endswith('.jpg') else ''

round2 = []
for k in os.listdir(SRC):
    s = stem(k)
    if not s:
        continue
    if s.startswith('T') or s[:2] in ('B1', 'M1', 'H1', 'W1', 'V1', 'R1', 'G1') or s in ('K01', 'K02', 'K03', 'U02'):
        round2.append(k)

round2.sort()
rows = (len(round2) + COLS - 1) // COLS
W = COLS * (CELL + PAD) + PAD
H = rows * (CELL + LABEL_H + PAD) + PAD
sheet = Image.new('RGB', (W, H), (18, 18, 20))
d = ImageDraw.Draw(sheet)
f = font(20)
for i, k in enumerate(round2):
    r, c = divmod(i, COLS)
    x = PAD + c * (CELL + PAD)
    y = PAD + r * (CELL + LABEL_H + PAD)
    try:
        im = Image.open(os.path.join(SRC, k)).convert('RGB')
        im.thumbnail((CELL, CELL))
        ox = x + (CELL - im.width) // 2
        oy = y + LABEL_H + (CELL - im.height) // 2
        sheet.paste(im, (ox, oy))
    except Exception:
        d.text((x + 4, y + 4), k + ' ERR', fill=(255, 120, 120), font=f)
    d.rectangle([x, y, x + CELL, y + LABEL_H], fill=(40, 40, 46))
    d.text((x + 6, y + 3), k, fill=(250, 250, 250), font=f)
sheet.save(os.path.join(SRC, 'sheet_R2.png'), quality=88)
print('wrote sheet_R2.png', sheet.size, len(round2), 'tiles')
print(sorted(round2))
