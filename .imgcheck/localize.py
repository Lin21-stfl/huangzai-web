# -*- coding: utf-8 -*-
"""Localize every remote image: download to assets/img/ and rewrite HTML to relative paths."""
import re, os, time, urllib.request

ROOT = r"C:\Users\LQT\Desktop\三下乡\网页设计\Xin"
IMGDIR = os.path.join(ROOT, 'assets', 'img')
os.makedirs(IMGDIR, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
FILES = ['index.html', 'attractions.html', 'stays.html', 'experiences.html', 'guides.html', 'guide-detail.html']

URL_RE = re.compile(r'https://images\.(unsplash|pexels)\.com/([^"\s]+)')

def local_name(kind, rest, url):
    # pick sensible width: cap at 1920
    m = re.search(r'[?&]w=(\d+)', url)
    w = min(int(m.group(1)), 1920) if m else 800
    if kind == 'pexels':
        pid = rest.split('/')[1]
        return 'p%s-w%d.jpg' % (pid, w)
    else:
        slug = rest.split('?')[0].rstrip('/')
        slug = slug.replace('/', '-')
        return 'u%s-w%d.jpg' % (slug, w)

def fetch(url, dest, tries=5):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            with open(dest, 'wb') as f:
                f.write(data)
            return len(data)
        except Exception as e:
            wait = 6 + attempt * 6
            print('   retry %d (%s) in %ds' % (attempt + 1, str(e)[:36], wait))
            time.sleep(wait)
    return 0

# collect unique (url -> localname)
jobs = {}
for fn in FILES:
    with open(os.path.join(ROOT, fn), encoding='utf-8') as f:
        html = f.read()
    for m in URL_RE.finditer(html):
        url = m.group(0)
        if url not in jobs:
            jobs[url] = local_name(m.group(1), m.group(2), url)

print('unique images:', len(jobs))
fail = []
for url, name in sorted(jobs.items(), key=lambda kv: kv[1]):
    dest = os.path.join(IMGDIR, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 5000:
        print('have  %s' % name)
        continue
    n = fetch(url, dest)
    if n:
        print('ok    %-40s %6.1f KB' % (name, n / 1024))
    else:
        print('FAIL  %s  %s' % (name, url))
        fail.append((url, name))
    time.sleep(1.5)

if fail:
    print('FAILED:', len(fail))
    for u, n in fail:
        print('  ', n, u)
else:
    # rewrite HTML
    for fn in FILES:
        p = os.path.join(ROOT, fn)
        with open(p, encoding='utf-8') as f:
            html = f.read()

        def repl(m):
            return 'assets/img/' + jobs[m.group(0)]
        html2 = URL_RE.sub(repl, html)
        with open(p, 'w', encoding='utf-8', newline='') as f:
            f.write(html2)
    print('HTML rewritten to relative asset paths.')
