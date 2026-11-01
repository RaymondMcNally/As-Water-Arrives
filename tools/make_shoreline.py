"""Shoreline of the docks: land won from the sea, and the high-water lines of 1837, 1910 and 2023 -> data/shoreline.json, building field rc.
Usage: python3 make_shoreline.py <docks_change_itm.geojson> <docks_change_wgs84.geojson> <site>
Both files come from the docks history work (Sligo/Docks_history): the 1837 and 1910 high-water lines were traced by eye from the
Ordnance Survey six-inch (surveyed 1837) and 25-inch (surveyed 1910) sheets, to within about 15 m; where the shore has not moved
the 2023 high-water mark from Tailte Eireann's DLM Core (2023 Q4) is used. Periods: pre1837 (behind the Ballast Wall),
1837_1910 (Deepwater causeway and quay), after_1910 (the Upper Flat, filled c. 1958-1994; unchanged on the 1940 revision).
rc on each building whose footprint centre is on reclaimed land: 1 before 1837, 2 1837-1910, 3 after 1940."""
import sys, json, geopandas as gpd, shapely
from shapely.geometry import shape
PI, LW, SITE = sys.argv[1:4]
P = json.load(open(PI)); L = json.load(open(LW))
fut = json.load(open(f'{SITE}/data/opw_future.json'))['features']
zone = lambda lv: gpd.GeoSeries([shape(x['geometry']) for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == lv and x['properties']['rp'] == 100], crs=4326).to_crs(2157).union_all()
Z = {lv: zone(lv) for lv in (0, 0.5, 1)}
B = json.load(open(f'{SITE}/data/buildings.json'))
BG = gpd.GeoSeries([shape(f['geometry']) for f in B['features']], crs=4326).to_crs(2157).representative_point()
flat = lambda cs: [round(v, 1) for c in cs for v in c[:2]]
CODE = {'pre1837': 1, '1837_1910': 2, 'after_1910': 3}
NAME = {'pre1837': 'Enclosed behind the Ballast Wall, before 1837', '1837_1910': 'Railway causeway and Deepwater Berths Quay, 1837–1910', 'after_1910': 'The Upper Flat, filled after 1940 (mostly c. 1958–1994)'}
for f in B['features']: f['properties']['rc'] = None
out = {'source': 'Ordnance Survey six-inch 1837 and 25-inch 1910 (traced, about ±15 m); Tailte Éireann DLM Core 2023 Q4 high-water mark', 'periods': [], 'lines': []}
for f in P['features']:
    k = f['properties']['period']; g = shape(f['geometry']).buffer(0)
    polys = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    inside = [i for i, p in enumerate(BG.values) if g.contains(p)]
    for i in inside: B['features'][i]['properties']['rc'] = CODE[k]
    fl = {str(lv): round(100 * g.intersection(z).area / g.area) for lv, z in Z.items()}
    nb = {str(lv): sum(1 for i in inside if (B['features'][i]['properties'].get('cf100') is not None and B['features'][i]['properties']['cf100'] <= lv)) for lv in (0, 1)}
    out['periods'].append({'k': k, 'c': CODE[k], 'name': NAME[k], 'ha': round(g.area / 1e4, 1), 'r': [[flat(p.exterior.coords)] + [flat(h.coords) for h in p.interiors] for p in polys],
                           'flood': fl, 'n': len(inside), 'nb': nb})
for f in L['features']:
    k = f['properties']['period']
    if not k.startswith('hwm'): continue
    line = gpd.GeoSeries([shape(f['geometry'])], crs=4326).to_crs(2157).values[0].simplify(0.5)
    out['lines'].append({'k': k[3:], 'xy': flat(line.coords)})
json.dump(out, open(f'{SITE}/data/shoreline.json', 'w'), separators=(',', ':'))
json.dump(B, open(f'{SITE}/data/buildings.json', 'w'), separators=(',', ':'), allow_nan=False)
for p in out['periods']: print(p['k'], p['ha'], 'ha', p['n'], 'buildings', p['flood'], p['nb'])
