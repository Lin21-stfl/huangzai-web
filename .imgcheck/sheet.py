import os, sys, json
from PIL import Image, ImageDraw, ImageFont

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = SRC
COLS = 5
CELL = 300
PAD = 6
LABEL_H = 26


def font(size=18):
    for p in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\arial.ttf"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def build(prefix, outname):
    keys = sorted(k for k in os.listdir(SRC) if k.startswith(prefix) and k.endswith('.jpg'))
    if not keys:
        print('no files for', prefix)
        return
    rows = (len(keys) + COLS - 1) // COLS
    W = COLS * (CELL + PAD) + PAD
    H = rows * (CELL + LABEL_H + PAD) + PAD
    sheet = Image.new('RGB', (W, H), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    f = font(20)
    for i, k in enumerate(keys):
        r, c = divmod(i, COLS)
        x = PAD + c * (CELL + PAD)
        y = PAD + r * (CELL + LABEL_H + PAD)
        try:
            im = Image.open(os.path.join(SRC, k)).convert('RGB')
        except Exception as e:
            d.text((x + 4, y + 4), k + ' ERR', fill=(255, 120, 120), font=f)
            continue
        im.thumbnail((CELL, CELL))
        ox = x + (CELL - im.width) // 2
        oy = y + LABEL_H + (CELL - im.height) // 2
        sheet.paste(im, (ox, oy))
        d.rectangle([x, y, x + CELL, y + LABEL_H], fill=(40, 40, 46))
        d.text((x + 6, y + 3), k, fill=(250, 250, 250), font=f)
    sheet.save(os.path.join(OUT, outname), quality=88)
    print('wrote', outname, sheet.size, len(keys), 'tiles')


for pref, out in [
    ('A', 'sheet_A.png'),
    ('B', 'sheet_B.png'),
    ('C', 'sheet_C.png'),
    ('D', 'sheet_D.png'),
    ('E', 'sheet_E.png'),
    ('F', 'sheet_F.png'),
    ('G', 'sheet_G.png'),
    ('H', 'sheet_H.png'),
    ('J', 'sheet_J.png'),
    ('K', 'sheet_K.png'),
    ('L', 'sheet_L.png'),
    ('N', 'sheet_N.png'),
    ('P', 'sheet_P.png'),
    ('M', 'sheet_M.png'),
    ('I', 'sheet_I.png'),
]:
    build(pref, out)
