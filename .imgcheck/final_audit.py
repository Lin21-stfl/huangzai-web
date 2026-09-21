# -*- coding: utf-8 -*-
"""Final audit: tag balance, internal links, local asset existence, leftover remote URLs."""
import re, os

ROOT = r"C:\Users\LQT\Desktop\三下乡\网页设计\Xin"
FILES = ['index.html', 'attractions.html', 'stays.html', 'experiences.html', 'guides.html', 'guide-detail.html']

ok = True
for fn in FILES:
    p = os.path.join(ROOT, fn)
    with open(p, encoding='utf-8') as f:
        html = f.read()

    # 1. leftover remote image URLs?
    remote = re.findall(r'https://images\.(?:unsplash|pexels)\.com[^"\s]*', html)
    if remote:
        ok = False
        print('%s LEFTOVER REMOTE: %d e.g. %s' % (fn, len(remote), remote[0][:80]))

    # 2. local asset existence
    missing = []
    for src in re.findall(r'(?:src|href)="(assets/[^"]+)"', html):
        if not os.path.exists(os.path.join(ROOT, src)):
            missing.append(src)
    if missing:
        ok = False
        print('%s MISSING ASSETS: %s' % (fn, sorted(set(missing))))

    # 3. anchor integrity: href="#x" must have id="x"
    ids = set(re.findall(r'id="([^"]+)"', html))
    dangling = set()
    for h in re.findall(r'href="#([^"]+)"', html):
        if h and h not in ids:
            dangling.add(h)
    if dangling:
        ok = False
        print('%s DANGLING ANCHORS: %s' % (fn, sorted(dangling)))

    # 4. tag balance for key tags
    for tag in ['div', 'section', 'article', 'nav', 'header', 'footer', 'main', 'ul', 'li', 'a', 'button', 'span', 'h2', 'h3', 'p', 'figure']:
        opens = len(re.findall(r'<%s(\s|>)' % tag, html))
        closes = len(re.findall(r'</%s>' % tag, html))
        if opens != closes:
            ok = False
            print('%s TAG IMBALANCE <%s>: %d open vs %d close' % (fn, tag, opens, closes))

    # 5. img tags all have alt
    imgs = re.findall(r'<img[^>]*>', html)
    noalt = [i[:60] for i in imgs if 'alt=' not in i]
    if noalt:
        ok = False
        print('%s IMG WITHOUT ALT: %d' % (fn, len(noalt)))

    print('%s: imgs=%d' % (fn, len(imgs)))

# 6. css var/class audit (quick): classes used in HTML exist in css?
css_all = ''
for c in ['base.css', 'tokens.css', 'components.css', 'components-extra.css', 'pages.css']:
    with open(os.path.join(ROOT, 'assets', 'css', c), encoding='utf-8') as f:
        css_all += f.read()
defined = set(re.findall(r'\.([a-zA-Z][\w-]*)', css_all))
used = set()
for fn in FILES:
    with open(os.path.join(ROOT, fn), encoding='utf-8') as f:
        html = f.read()
    for m in re.findall(r'class="([^"]+)"', html):
        used.update(m.split())
undef = sorted(u for u in used if u not in defined)
print('undefined classes:', undef if undef else 'none')
if undef:
    ok = False

print('AUDIT:', 'PASS' if ok else 'FAIL')
