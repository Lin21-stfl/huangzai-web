import os, json, urllib.request

SRC = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

PEXELS = {
    'T01': ('6872257',  'tea rolling landscape Vietnam hills'),
    'T02': ('23224800', 'fog over tea-like hedges countryside'),
    'T03': ('11669665', 'green tea plantations on hills'),
    'T04': ('6136356',  'green tea shrubs farmland sundown'),
    'T05': ('38467899', 'aerial lush green tea plantations'),
    'K01': ('4544202',  'farmers with straw baskets picking tea'),
    'K02': ('15275064', 'woman working in tea field'),
    'K03': ('33983448', 'tea harvesting in vietnam'),
    'B10': ('8803722',  'low angle green bamboo trees'),
    'B11': ('12589611', 'pathway between bamboos'),
    'B12': ('37179211', 'dense bamboo grove'),
    'M10': ('30050831', 'chinese architecture mountainous setting'),
    'M11': ('29606775', 'elegant chinese temple roof blue sky'),
    'M12': ('37470752', 'colorful traditional chinese temple gate'),
    'M13': ('30703907', 'illuminated chinese pagoda at night'),
    'M14': ('38173990', 'traditional chinese temple architecture'),
    'H10': ('30364262', 'women in hanfu walking outdoors'),
    'H11': ('32073913', 'hanfu with umbrella'),
    'H12': ('37664482', 'red hanfu outdoors'),
    'W10': ('35268681', 'tulou with red lanterns'),
    'W11': ('38606300', 'fujian tulou mountain view'),
    'W12': ('34334654', 'hakka tulou lush landscape'),
    'W13': ('34722283', 'aerial tulou autumn'),
    'V10': ('32700828', 'chinese street red lanterns'),
    'V11': ('34583540', 'wooden houses chinese village'),
    'V12': ('34673875', 'traditional chinese village'),
    'V13': ('33933748', 'chinese building ivy archway'),
    'R10': ('37302362', 'misty mountain road sunrise'),
    'R11': ('36744081', 'scenic road dali mountain views'),
    'G10': ('31773101', 'golden ginkgo tree autumn'),
    'G11': ('35035927', 'ginkgo over rustic roof'),
    'G12': ('37983538', 'autumn park golden ginkgo trees'),
}

UNSPLASH_VERIFY = {
    'U01': 'photo-1564890369478-f03dacbc282e',   # used as main tea field
    'U02': 'photo-1469854523086-cc02fe5d8800',   # used as mountain road
    'U03': 'photo-1600607687939-ce4a3c5b9d1c',   # used as zen guesthouse interior
}

ok, fail = 0, 0
for key, (pid, desc) in PEXELS.items():
    dest = os.path.join(SRC, key + '.jpg')
    if os.path.exists(dest):
        ok += 1
        continue
    url = 'https://images.pexels.com/photos/%s/pexels-photo-%s.jpeg?auto=compress&cs=tinysrgb&w=800' % (pid, pid)
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
            f.write(r.read())
        ok += 1
    except Exception as e:
        print('FAIL', key, pid, e)
        fail += 1

for key, slug in UNSPLASH_VERIFY.items():
    dest = os.path.join(SRC, key + '.jpg')
    if os.path.exists(dest):
        ok += 1
        continue
    url = 'https://images.unsplash.com/%s?w=800&q=70&fm=jpg' % slug
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
            f.write(r.read())
        ok += 1
    except Exception as e:
        print('FAIL', key, slug, e)
        fail += 1

print('downloaded:', ok, 'failed:', fail)
