"""Sligo County Council's land registers for the model -> data/registers.json.
Usage: python3 make_registers.py <vacant_sites_itm.geojson> <rzlt geojson> <site>
- Vacant Sites Register (Urban Regeneration and Housing Act 2015), as updated 16 October 2024: 14 sites. The outlines were traced
  from the Council's 1:2500 site maps (sligococo.ie/planning/VacantSitesRegister) by registering each scanned map to the
  building footprints and roads, so they are good to a few metres. Addresses, dates and valuations are from the register page.
- Residential Zoned Land Tax, final map for 2026 (Department of Housing, Local Government and Heritage open data, CC BY 4.0),
  Sligo County Council parcels: land zoned for housing or mixed use and serviced, in scope of the tax.
Each site and parcel is flagged when it is in today's OPW 1-in-100-year flood zones (sea or river) and with the sea 1 m higher."""
import sys, json, geopandas as gpd
from shapely.geometry import shape, Point
VS, RZ, SITE = sys.argv[1:4]
M = json.load(open(f'{SITE}/data/model.json')); C = Point(*M['centre']).buffer(M['radius'])
fut = json.load(open(f'{SITE}/data/opw_future.json'))['features']; opw = json.load(open(f'{SITE}/data/opw_flood.json'))['features']
u = lambda fs: gpd.GeoSeries([shape(x['geometry']) for x in fs], crs=4326).to_crs(2157).union_all()
today = u([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 0 and x['properties']['rp'] == 100] + [x for x in opw if x['properties']['aep'] == 1])
plus1 = u([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 1 and x['properties']['rp'] == 100]).union(today)
INFO = {  # register page: address, date entered, market valuation (as listed on the register updated April 2022)
    'SL-VS-05': ('Circular Road', '2018-12-18', 500000), 'SL-VS-07': ('Oakfield Road', '2018-10-25', 700000),
    'SL-VS-12': ('Cranmore Road, Abbeyquarter South', '2018-12-18', 2400000), 'SL-VS-13': ('Cairns Road', '2018-10-25', 1150000),
    'SL-VS-14': ('Caltragh Road', '2018-10-25', 1125000), 'SL-VS-16': ('Newtownholmes Road', '2018-10-25', 450000),
    'SL-VS-17': ('Caltragh Road', '2018-10-25', 435000), 'SL-VS-20': ('Cornageeha', '2018-10-25', 232000),
    'SL-VS-22': ('Cartron', '2018-10-25', 1300000), 'SL-VS-24': ('Maugheraboy and Knocknaganny', '2018-12-11', 4000000),
    'SL-VS-25': ("Lynn's Dock, Rathedmond", '2018-12-11', 250000), 'SL-VS-28': ('Maugheraboy', '2018-12-11', 2100000),
    'SL-VS-33': ('Cranmore Road, Abbeyquarter South', '2018-12-12', 400000), 'SL-VS-39': ('Strandhill Road, Knappaghmore', '2018-12-18', 250000)}
flat = lambda cs: [round(v, 1) for c in cs for v in c[:2]]
rings = lambda g: [[flat(p.exterior.coords)] + [flat(h.coords) for h in p.interiors] for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g])]
def flags(g): return int(g.intersection(today).area > 0.05 * g.area or g.intersection(today).area > 200), int(g.intersection(plus1).area > 0.05 * g.area or g.intersection(plus1).area > 200)
out = {'source': {'vacant': 'Sligo County Council Vacant Sites Register, updated 16 October 2024 (outlines traced from the Council site maps)', 'rzlt': 'Residential Zoned Land Tax final map 2026, DHLGH open data, CC BY 4.0'}, 'vacant': [], 'rzlt': []}
for f in json.load(open(VS))['features']:
    g = shape(f['geometry']).buffer(0); ref = f['properties']['ref']; a, d, v = INFO[ref]; fz, fz1 = flags(g)
    out['vacant'].append({'ref': ref, 'addr': a, 'date': d, 'value': v, 'ha': round(g.area / 1e4, 2), 'in': int(C.intersects(g)), 'fz': fz, 'fz1': fz1, 'x': round(g.representative_point().x, 1), 'y': round(g.representative_point().y, 1), 'r': rings(g)})
Z = {'R1': 'new', 'RS': 'infill', 'M1': 'mixed', 'M2': 'centre', 'M3': 'centre', 'S5': 'mixed'}
for f in json.load(open(RZ))['features']:
    g = shape(f['geometry']).buffer(0)
    if not C.intersects(g): continue
    g = g.intersection(C); p = f['properties']; fz, fz1 = flags(g)
    out['rzlt'].append({'id': p['PARCEL_ID'], 'k': Z.get(p['ZONE_GZT'], 'mixed'), 'zone': (p['ZONE_ORIG'] or '').split(' – ')[0], 'zd': p['ZONE_ORIG'], 'ha': round(g.area / 1e4, 2), 'fz': fz, 'fz1': fz1, 'r': rings(g.simplify(0.5))})
json.dump(out, open(f'{SITE}/data/registers.json', 'w'), separators=(',', ':'))
import collections
print('vacant', len(out['vacant']), 'in circle', sum(v['in'] for v in out['vacant']), round(sum(v['ha'] for v in out['vacant']), 1), 'ha; flood today', sum(v['fz'] for v in out['vacant']), '+1m', sum(v['fz1'] for v in out['vacant']))
c = collections.Counter(r['k'] for r in out['rzlt']); h = collections.Counter()
for r in out['rzlt']: h[r['k']] += r['ha']
print('rzlt', len(out['rzlt']), dict(c), {k: round(v, 1) for k, v in h.items()}, 'flood today', sum(r['fz'] for r in out['rzlt']), '+1m', sum(r['fz1'] for r in out['rzlt']))
