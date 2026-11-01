"""National Inventory of Architectural Heritage (NIAH) for the model -> data/niah.json and building field nhr.
Usage: python3 make_niah.py <NIAH query .json (GeoJSON from the NIAHBuildingsOpenData service)> <site>
Each record is matched to the building footprint it falls in (or the nearest within 10 m). Kept: register number, name or
address, original and present use, dates, rating, short description, link. Flags: today's OPW 1-in-100-year flood zones
(sea or river), the sea 1 m higher (1 in 100 years, about 2100), distance to an SAC or SPA.
nhr on each matched building: 3 national (or international), 2 regional, 1 local."""
import sys, json, collections, geopandas as gpd, shapely
from shapely.geometry import Point, shape
X, SITE = sys.argv[1:3]
M = json.load(open(f'{SITE}/data/model.json')); C = Point(*M['centre']).buffer(M['radius'])
J = json.load(open(X))
fut = json.load(open(f'{SITE}/data/opw_future.json'))['features']; opw = json.load(open(f'{SITE}/data/opw_flood.json'))['features']
u = lambda fs: gpd.GeoSeries([shape(x['geometry']) for x in fs], crs=4326).to_crs(2157).union_all()
today = u([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 0 and x['properties']['rp'] == 100] + [x for x in opw if x['properties']['aep'] == 1])
plus1 = u([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 1 and x['properties']['rp'] == 100])
P = json.load(open(f'{SITE}/data/protected.json'))
eu = shapely.union_all([shapely.Polygon(list(zip(r[0][::2], r[0][1::2])), [list(zip(h[::2], h[1::2])) for h in r[1:]]) for s in P['sites'] if s['k'] in ('sac', 'spa') for r in s['r']])
B = json.load(open(f'{SITE}/data/buildings.json'))
BG = gpd.GeoDataFrame([{'i': i} for i in range(len(B['features']))], geometry=[shape(f['geometry']) for f in B['features']], crs=4326).to_crs(2157)
tree = shapely.STRtree(BG.geometry.values)
RANK = {'National': 3, 'International': 3, 'Regional': 2, 'Local': 1}
txt = lambda v: (str(v).strip() if v is not None and str(v).strip() not in ('', 'None') else None)
out = []; nm = 0
for f in J['features']:
    p = f['properties']; q = Point(float(p['ITM_E']), float(p['ITM_N']))
    if not C.contains(q): continue
    hit = tree.query(q, predicate='within'); b = None
    if len(hit): b = int(hit[0])
    else:
        j = tree.nearest(q)
        if BG.geometry.values[j].distance(q) <= 10: b = int(j)
    if b is not None: nm += 1
    g = BG.geometry.values[b] if b is not None else q
    addr = ' '.join(x for x in [txt(p.get('NUMBER')), txt(p.get('STREET1'))] if x)
    name = txt(p.get('NAME')) or addr or 'Building'
    out.append({'reg': p['REG_NO'], 'name': name, 'addr': addr if addr != name else None, 'orig': txt(p.get('ORIGINAL_TYPE')), 'use': txt(p.get('IN_USE_AS_TYPE')),
                'from': txt(p.get('DATEFROM')), 'to': txt(p.get('DATETO')), 'rating': txt(p.get('RATING')), 'desc': (txt(p.get('DESCRIPTION')) or '')[:240],
                'url': txt(p.get('WEBSITE_LINK')), 'x': round(q.x, 1), 'y': round(q.y, 1), 'b': b,
                'fz': int(g.intersects(today)), 'fz1': int(g.intersects(plus1)), 'pz': round(eu.distance(g)) if eu.distance(g) <= 200 else None})
for f in B['features']: f['properties']['nhr'] = None
for o in out:
    if o['b'] is not None:
        bp = B['features'][o['b']]['properties']; bp['nhr'] = max(bp['nhr'] or 0, RANK.get(o['rating'], 1))
json.dump(B, open(f'{SITE}/data/buildings.json', 'w'), separators=(',', ':'))
json.dump({'source': 'National Inventory of Architectural Heritage (NIAH), Department of Housing, Local Government and Heritage, buildingsofireland.ie (CC BY 4.0); NIAH Survey of County Sligo', 'items': out},
          open(f'{SITE}/data/niah.json', 'w'), separators=(',', ':'), ensure_ascii=False)
c = collections.Counter(o['rating'] for o in out)
print(len(out), 'in circle;', nm, 'matched to a footprint;', dict(c))
print('in today\'s flood zones', sum(o['fz'] for o in out), collections.Counter(o['rating'] for o in out if o['fz']), '| sea +1 m', sum(o['fz1'] for o in out), '| within 50 m of SAC/SPA', sum(1 for o in out if o['pz'] is not None and o['pz'] <= 50))
print('dates', collections.Counter((int(o['from']) // 50 * 50) if (o['from'] or '').isdigit() else None for o in out).most_common(8))
print('uses', collections.Counter(o['orig'] for o in out).most_common(10))
print('national', [(o['name'], o['from']) for o in out if o['rating'] in ('National', 'International')])
print('url sample', out[0]['url'])
