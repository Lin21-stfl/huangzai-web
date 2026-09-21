import json, urllib.request, urllib.parse, sys, io

API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'HuangZaiDesign/1.0 (image research)'}


def search(query, limit=6):
    params = {
        'action': 'query',
        'format': 'json',
        'generator': 'search',
        'gsrsearch': 'filetype:bitmap ' + query,
        'gsrnamespace': '6',
        'gsrlimit': str(limit),
        'prop': 'imageinfo',
        'iiprop': 'url|size|extmetadata',
        'iiurlwidth': '640',
    }
    url = API + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    out = []
    for p in (d.get('query', {}).get('pages', {}) or {}).values():
        ii = (p.get('imageinfo') or [{}])[0]
        out.append({
            'title': p.get('title'),
            'thumb': ii.get('thumburl'),
            'w': ii.get('width'), 'h': ii.get('height'),
        })
    return out


queries = {
    'tea_field':   'tea plantation China hills',
    'tea_picking': 'picking tea leaves China',
    'bamboo':      'bamboo forest path China',
    'pagoda':      'Chinese pagoda temple mountain',
    'hakka':       'Hakka walled village tulou',
    'oldvillage':  'ancient Chinese village old house',
    'hanfu':       'hanfu costume woman',
    'cloudsea':    'sea of clouds mountain sunrise China',
    'ginkgo':      'ginkgo tree autumn golden',
    'redsite':     'Chinese revolutionary memorial site',
}

res = {}
for key, q in queries.items():
    try:
        res[key] = search(q)
        print('==', key)
        for i, it in enumerate(res[key]):
            print('  %s%d %s | %sx%s' % (key[0].upper(), i + 1, it['title'][:70], it['w'], it['h']))
    except Exception as e:
        print('==', key, 'ERR', e)
        res[key] = []

json.dump(res, open('wiki_candidates.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved wiki_candidates.json')
