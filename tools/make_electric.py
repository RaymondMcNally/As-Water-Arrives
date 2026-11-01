"""Electricity network for the model -> data/electric.json, from two sources:
1. OpenStreetMap (Overpass export, ODbL): lines and cables with voltage, ESB substations, transformers, generators, poles.
2. Tailte Éireann PRIME2 1:1000 map sheets (read with LibreDWG; PRIME2_utility_points_ITM.csv): electricity distribution
   boxes (mini-pillars and kiosk substations), transformer poles, ESB pylons, electricity poles. Poles within 5 m of an
   OSM pole are counted once.
Each substation, transformer and distribution box is checked against today's OPW flood zones (sea 1 in 100 years, river
1%) and the sea 1 m higher (1 in 100 years, about 2100).
Usage: python3 make_electric.py <osm power .geojson> <PRIME2_utility_points_ITM.csv> <site>"""
import sys, csv, json, collections, geopandas as gpd, shapely
from shapely.geometry import Point, shape
OSM, CSV, SITE = sys.argv[1:4]
M = json.load(open(f'{SITE}/data/model.json')); C = Point(*M['centre']).buffer(M['radius']); C3 = C.buffer(300)
fut = json.load(open(f'{SITE}/data/opw_future.json'))['features']; opw = json.load(open(f'{SITE}/data/opw_flood.json'))['features']
u = lambda fs: gpd.GeoSeries([shape(x['geometry']) for x in fs], crs=4326).to_crs(2157).union_all()
today = u([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 0 and x['properties']['rp'] == 100] + [x for x in opw if x['properties']['aep'] == 1])
plus1 = u([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 1 and x['properties']['rp'] == 100])
fz = lambda g: (1 if g.intersects(today) else 0, 1 if g.intersects(plus1) else 0)
J = json.load(open(OSM))
G = gpd.GeoDataFrame([{**f['properties'], 'geometry': shape(f['geometry'])} for f in J['features']], crs=4326).to_crs(2157)
G = G[G.intersects(C3)]
def vclass(v):
    v = str(v or '').split(';')[0]
    return '38kv' if v in ('38000',) else '110kv' if v in ('110000', '220000') else 'mv' if v in ('10000', '20000') else 'lv' if v in ('230', '400') else 'unknown'
lines = []
for r in G[G.power.isin(['line', 'minor_line', 'cable'])].itertuples():
    g = r.geometry.intersection(C3)
    for q in (g.geoms if hasattr(g, 'geoms') else [g]):
        if q.geom_type == 'LineString': lines.append({'v': vclass(getattr(r, 'voltage', None)), 'u': 1 if r.power == 'cable' else 0, 'c': [round(x, 1) for xy in q.coords for x in xy]})
subs = []
for r in G[G.power == 'substation'].itertuples():
    g = r.geometry; z = fz(g)
    nm = r.name if isinstance(getattr(r, 'name', None), str) else 'ESB substation'
    subs.append({'name': nm, 'v': str(getattr(r, 'voltage', '') or '').replace('38000', '38 kV').replace('10000', '10 kV').replace(';', ' / '), 'fz': z[0], 'fz1': z[1],
                 'r': [round(x, 1) for xy in g.exterior.coords for x in xy] if g.geom_type == 'Polygon' else None, 'p': [round(g.centroid.x, 1), round(g.centroid.y, 1)]})
pts = []
gen = collections.Counter()
for r in G[G.power.isin(['transformer', 'generator', 'pole', 'tower'])].itertuples():
    q = r.geometry.centroid
    if not C.contains(q): continue
    k = {'transformer': 'tx', 'generator': 'gen', 'pole': 'pole', 'tower': 'pylon'}[r.power]
    if k == 'gen': gen[str(getattr(r, '_asdict')().get('generator:source') or getattr(r, 'generator_source', '') or '?')] += 1
    pts.append([k, round(q.x, 1), round(q.y, 1)])
osm_poles = shapely.STRtree([Point(p[1], p[2]) for p in pts if p[0] in ('pole', 'pylon')]) if pts else None
K = {'Electricity distribution box (mini-pillar or kiosk substation)': 'sub', 'Transformer pole': 'tx', 'ESB pylon': 'pylon', 'Electricity pole': 'pole'}
dup = 0
for r in csv.DictReader(open(CSV)):
    k = K.get(r['type']); x, y = float(r['easting_itm']), float(r['northing_itm'])
    if not k or not C.contains(Point(x, y)): continue
    if k in ('pole', 'pylon') and osm_poles is not None and len(osm_poles.query(Point(x, y).buffer(5))): dup += 1; continue
    pts.append([k, round(x, 1), round(y, 1)])
for p in pts: p.extend(fz(Point(p[1], p[2])) if p[0] in ('sub', 'tx', 'gen') else (0, 0))
out = {'source': '© OpenStreetMap contributors (ODbL), Overpass export ' + J.get('timestamp', '') + '; Tailte Éireann PRIME2 1:1000 mapping (street features)',
       'kinds': {'sub': 'Electricity distribution box (mini-pillar or kiosk substation)', 'tx': 'Transformer', 'pylon': 'ESB pylon', 'pole': 'Electricity pole', 'gen': 'Solar panels'},
       'lines': lines, 'subs': subs, 'points': pts}
old = json.load(open(f'{SITE}/data/electric.json')) if __import__('os').path.exists(f'{SITE}/data/electric.json') else {}
if old.get('coverage'): out['coverage'] = old['coverage']; out['cover'] = old.get('cover')
json.dump(out, open(f'{SITE}/data/electric.json', 'w'), separators=(',', ':'), ensure_ascii=False)
L = gpd.GeoSeries([shapely.LineString([l['c'][i:i + 2] for i in range(0, len(l['c']), 2)]) for l in lines], crs=2157)
km = collections.Counter(); [km.update({l['v'] + (' cable' if l['u'] else ''): g.intersection(C).length / 1000}) for l, g in zip(lines, L)]
print('lines km', {k: round(v, 1) for k, v in km.items()}); print('substations', [(s['name'], s['v'], s['fz'], s['fz1']) for s in subs])
print('points', collections.Counter(p[0] for p in pts), '| pole duplicates dropped', dup, '| generators', gen)
print('in today\'s flood zone', collections.Counter(p[0] for p in pts if p[3]), '| +1 m', collections.Counter(p[0] for p in pts if p[4]))
