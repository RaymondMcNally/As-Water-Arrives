"""New homes sold in the model, from the Property Price Register -> data/newhomes.json. Counts only: no addresses, no prices.
Usage: python3 make_newhomes.py <placed_private.csv> <site>
placed_private.csv is made on Ray's computer from PPR-ALL.csv (Co. Sligo rows) by place2.py: each sale is placed by its Eircode
(GeoDirectory), or by the estate or street name in its address (GeoDirectory, OpenStreetMap, Nominatim), or, for estates built since
the GeoDirectory extract (Farmhill Manor, The Dartry, Dartry Way), at the planning permission that built them. A sale is new when the
PPR describes it as "New Dwelling house /Apartment" (sold with VAT; the register shows the price without it).
Sales are grouped by place. 'approx' marks places put at the middle of a road or townland because the estate itself is not on any map yet."""
import sys, json, re, pandas as pd
from collections import Counter
P, SITE = sys.argv[1:3]
o = pd.read_csv(P)
town = o[o.inside]
n = town[town.new]
def title(s): return ' '.join(w.capitalize() if w not in ('NA', 'AN') else w.lower() for w in str(s).split())
places = []
n = n.assign(grp=[h + '|' + (e if h == 'eircode' else '') for h, e in zip(n.how, n.est.fillna(''))])
for key, g in n.groupby('grp'):
    key = key.split('|')[0]
    kind, name = (key.split(':', 1) + [''])[:2] if ':' in key else ('eircode', '')
    ests = Counter(re.sub(r'^[A-Z] ', '', e) for e in g.est if isinstance(e, str) and len(e) > 3 and not re.match(r'^(APARTMENT|APT|BLOCK|NO)\b', e))
    label = name if kind != 'eircode' else (ests.most_common(1)[0][0] if ests else 'Sligo')
    top = [title(e) for e, _ in ests.most_common(3) if e not in ('SLIGO',)]
    lead = ests.most_common(1)[0][0] if ests else name
    approx = int(kind == 'name' and lead != name)
    years = Counter(int(y) for y in g.y)
    places.append({'name': title(lead if approx else label), 'area': title(name) if approx else None, 'estates': top, 'x': round(float(g.x.iloc[0]), 1), 'y': round(float(g.yy.iloc[0]), 1),
                   'n': len(g), 'y0': min(years), 'y1': max(years), 'by': {str(k): v for k, v in sorted(years.items())}, 'how': kind, 'approx': approx, 'bulk': int(g.nfm.sum())})
places.sort(key=lambda p: -p['n'])
yr = range(2010, int(o.y.max()) + 1)
out = {'source': 'Property Price Register (PSRA), Co. Sligo, 2010 to Oct 2026; new dwellings only; counts, no addresses or prices',
       'years': [yr.start, yr.stop - 1],
       'town_new': {str(y): int((n.y == y).sum()) for y in yr}, 'town_all': {str(y): int((town.y == y).sum()) for y in yr},
       'county_new': {str(y): int(((o.y == y) & o.new).sum()) for y in yr}, 'places': places}
json.dump(out, open(f'{SITE}/data/newhomes.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(places), 'places', len(n), 'new sales in the circle;', sum(p['n'] for p in places if p['approx']), 'at approximate places')
for p in places[:16]: print(p['n'], p['name'], p['estates'], p['y0'], p['y1'], 'approx' if p['approx'] else '', p['how'])
