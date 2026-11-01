"""OPW future flood maps for the site -> data/opw_future.json and building fields cf2, cf20, cf100, om, oh.
Usage: python3 make_opw_future.py <folder of Sligo GeoJSON clips> <scratchpad with out/buildings_for_mesh.gpkg> <site>
Coastal: National Coastal Flood Hazard Mapping 2021 (ncfhm), future scenarios for about 2100: m = mid-range (+0.5 m sea
level), h = high-end (+1.0 m), h+ (+1.5 m), h++ (+2.0 m); kept at 1 in 2, 20 and 100 years. River: NIFM/CFRAM future
extents (esds), m = mid-range, h = high-end, at 10%, 1% and 0.1% a year (1 in 10, 100, 1,000).
Each building: the smallest sea-level rise whose extent reaches it, per return period (cf2, cf20, cf100), and the most
likely river band in each river future (om, oh), as with op for today's river map."""
import sys, glob, json, os, geopandas as gpd, shapely
from shapely.geometry import Point, mapping
from shapely.ops import unary_union, transform as stransform
from pyproj import Transformer
A, S, SITE = sys.argv[1:4]
to_ll = Transformer.from_crs(2157, 4326, always_xy=True).transform
M = json.load(open(f'{SITE}/data/model.json')); C = Point(*M['centre']).buffer(M['radius'], 256)
RISE = {'m': .5, 'h': 1.0, 'hplus': 1.5, 'hplusplus': 2.0}
def load(f, crs):
    J = json.load(open(f)); g = gpd.GeoDataFrame.from_features(J['features'], crs=crs).to_crs(2157)
    u = unary_union(shapely.force_2d(g.geometry).make_valid())
    return u.intersection(C.buffer(300)).buffer(0.6).buffer(-0.6).simplify(1.0)
layers = []
for code, rise in RISE.items():
    for rp in (2, 20, 100):
        layers.append(({'src': 'coast', 'level': rise, 'rp': rp}, load(f'{A}/ncfhm_itm_ext_c_{code}_{rp:04d}.geojson', 2157)))
for fut in ('m', 'h'):
    for rp, aep in ((10, 10), (100, 1), (1000, .1)):
        layers.append(({'src': 'opw', 'level': aep, 'fut': fut}, load(f'{A}/esds_floodmap_ext_f_{fut}_{rp:04d}.geojson', 29903)))
feats = []
for p, g in layers:
    p = dict(p, ha=round(g.intersection(C).area / 1e4)); print(p)
    feats.append({'type': 'Feature', 'properties': p, 'geometry': mapping(shapely.set_precision(stransform(to_ll, g), 1e-6))})
json.dump({'type': 'FeatureCollection', 'features': feats}, open(f'{SITE}/data/opw_future.json', 'w'), separators=(',', ':'))
print('opw_future.json', os.path.getsize(f'{SITE}/data/opw_future.json') // 1024, 'KB')
bm = gpd.read_file(f'{S}/out/buildings_for_mesh.gpkg').to_crs(2157); tree = shapely.STRtree(bm.geometry.values); guid = bm.guid.values
val = {}
for p, g in layers:
    hit = [guid[i] for i in tree.query(g, predicate='intersects')]
    if p['src'] == 'coast':
        k = f"cf{p['rp']}"
        for gu in hit: d = val.setdefault(gu, {}); d[k] = min(d.get(k, 9), p['level'])
    else:
        k = 'o' + p['fut']
        for gu in hit: d = val.setdefault(gu, {}); d[k] = max(d.get(k, 0), p['level'])
B = json.load(open(f'{SITE}/data/buildings.json')); n = {}
for ft in B['features']:
    v = val.get(ft['properties']['g'], {})
    for k in ('cf2', 'cf20', 'cf100', 'om', 'oh'):
        ft['properties'][k] = v.get(k)
        if v.get(k) is not None: n[k] = n.get(k, 0) + 1
json.dump(B, open(f'{SITE}/data/buildings.json', 'w'), separators=(',', ':'))
print('buildings with a value', n)
