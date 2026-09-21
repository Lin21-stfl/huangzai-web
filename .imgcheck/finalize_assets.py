# -*- coding: utf-8 -*-
"""Final localization: use verified .imgcheck copies for pexels; existing assets/img for unsplash.
Collapse per-width variants to one file per photo. Rewrite HTML to relative paths."""
import re, os, shutil

ROOT = r"C:\Users\LQT\Desktop\三下乡\网页设计\Xin"
IMGDIR = os.path.join(ROOT, 'assets', 'img')
CHK = os.path.join(ROOT, '.imgcheck')
FILES = ['index.html', 'attractions.html', 'stays.html', 'experiences.html', 'guides.html', 'guide-detail.html']
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

# pexels photo id -> verified local copy in .imgcheck (w=800)
PEX_SRC = {
    '6872257': 'T01.jpg', '4544202': 'K01.jpg', '23224800': 'T02.jpg',
    '32700828': 'V10.jpg', '11669665': 'T03.jpg', '33933748': 'V13.jpg',
    '34673875': 'V12.jpg', '34583540': 'V11.jpg', '34722283': 'W13.jpg',
    '30703907': 'M13.jpg', '12589611': 'B11.jpg', '30364262': 'H10.jpg',
    '37664482': 'H12.jpg', '35035927': 'G11.jpg', '35268681': 'W10.jpg',
    '37302362': 'R10.jpg', '33097432': 'Z03.jpg', '37470752': 'M12.jpg',
    '32073913': 'H11.jpg', '37983538': 'G12.jpg', '30050831': 'M10.jpg',
}

# 1. copy verified pexels images into assets/img (one file per photo)
for pid, src in PEX_SRC.items():
    s = os.path.join(CHK, src)
    d = os.path.join(IMGDIR, 'p%s.jpg' % pid)
    if os.path.exists(s):
        shutil.copyfile(s, d)
        print('copied p%s.jpg  <- %s (%.1f KB)' % (pid, src, os.path.getsize(s) / 1024))
    else:
        print('!! MISSING source', src)

# 2. rewrite HTML
URL_RE = re.compile(r'https://images\.(unsplash|pexels)\.com/([^"\s]+)')

def map_url(kind, rest):
    if kind == 'pexels':
        pid = rest.split('/')[1]
        return 'assets/img/p%s.jpg' % pid
    m = re.search(r'[?&]w=(\d+)', rest)
    w = min(int(m.group(1)), 1920) if m else 800
    slug = rest.split('?')[0].rstrip('/').replace('/', '-')
    return 'assets/img/u%s-w%d.jpg' % (slug, w)

total_local = 0
for fn in FILES:
    p = os.path.join(ROOT, fn)
    with open(p, encoding='utf-8') as f:
        html = f.read()
    html2, n = URL_RE.subn(lambda m: map_url(m.group(1), m.group(2)), html)
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(html2)
    total_local += n
    print('%s: %d URLs localized' % (fn, n))

# 3. verify every referenced local asset exists; fetch missing unsplash variants
import urllib.request, time
missing = []
for fn in FILES:
    with open(os.path.join(ROOT, fn), encoding='utf-8') as f:
        html = f.read()
    for src in re.findall(r'(?:src|data-image)="(assets/img/[^"]+)"', html):
        if not os.path.exists(os.path.join(ROOT, src)):
            missing.append((fn, src))
print('missing local refs:', len(missing))
for fn, src in missing:
    print('  MISSING', fn, src)
