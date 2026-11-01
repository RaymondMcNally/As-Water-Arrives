"""NPWS protected sites (SAC 2023-07, SPA 2023-05, NHA 2019-06, pNHA 2015-11, ITM shapefiles clipped to Sligo as GeoJSON)
-> data/protected.json, building field pz and planning flag pz.
Usage: python3 make_protected.py <folder with sac/spa/nha/pnha.geojson> <site>
pz = metres from the building (or planning site) to the nearest SAC or SPA, kept up to 200 m (larger left empty)."""
import sys, os, json, geopandas as gpd, shapely, shapely.ops
from shapely.geometry import Point, shape, mapping
G, SITE = sys.argv[1:3]
M = json.load(open(f'{SITE}/data/model.json')); CX, CY = M['centre']; R = M['radius']; C = Point(CX, CY).buffer(R, 256); C3 = C.buffer(300)
NAME = {'sac': 'Special Area of Conservation (EU Habitats Directive)', 'spa': 'Special Protection Area (EU Birds Directive)', 'nha': 'Natural Heritage Area', 'pnha': 'Proposed Natural Heritage Area'}
sites = []
for k in ('sac', 'spa', 'nha', 'pnha'):
    f = f'{G}/{k}.geojson'
    if not os.path.exists(f): continue
    J = json.load(open(f))
    for ft in J['features']:
        g = shapely.make_valid(shape(ft['geometry'])); inside = g.intersection(C).area / 1e4
        if inside < 0.05: continue
        p = ft['properties']; gc = g.intersection(C3).simplify(1.0)
        polys = [q for q in (gc.geoms if hasattr(gc, 'geoms') else [gc]) if q.geom_type == 'Polygon']
        sites.append({'k': k, 'code': p['SITECODE'], 'name': p['SITE_NAME'].replace(' SAC', '').replace(' SPA', ''), 'ha': round(float(p['HA'])), 'hain': round(inside, 1),
                      'url': p.get('URL') or f'https://www.npws.ie/protected-sites/{k}/{p["SITECODE"]}',
                      'r': [[[round(v, 1) for xy in ring.coords for v in xy] for ring in [q.exterior, *q.interiors]] for q in polys], 'geom': g})
        print(k, p['SITECODE'], p['SITE_NAME'], round(inside, 1), 'ha in circle')
out = [{x: s[x] for x in ('k', 'code', 'name', 'ha', 'hain', 'url', 'r')} for s in sites]
json.dump({'source': 'National Parks and Wildlife Service (NPWS) designated site boundaries, CC BY 4.0: SAC 2023-07, SPA 2023-05, NHA 2019-06, pNHA 2015-11', 'kinds': NAME, 'sites': out},
          open(f'{SITE}/data/protected.json', 'w'), separators=(',', ':'), ensure_ascii=False)
eu = shapely.union_all([s['geom'] for s in sites if s['k'] in ('sac', 'spa')])
from pyproj import Transformer
tf = Transformer.from_crs(4326, 2157, always_xy=True).transform
def dist(g): d = eu.distance(g); return round(d) if d <= 200 else None
B = json.load(open(f'{SITE}/data/buildings.json')); n = 0
for f in B['features']:
    g = shapely.ops.transform(tf, shape(f['geometry'])); f['properties']['pz'] = dist(g); n += f['properties']['pz'] is not None and f['properties']['pz'] <= 50
json.dump(B, open(f'{SITE}/data/buildings.json', 'w'), separators=(',', ':'))
P = json.load(open(f'{SITE}/data/planning.json')); m = 0
for a in P['apps']:
    g = shapely.Polygon(list(zip(a['r'][0][::2], a['r'][0][1::2]))) if a.get('r') else Point(*a['p'])
    a['pz'] = dist(g); m += a['dec'] == 'granted' and a['pz'] is not None and a['pz'] <= 50
json.dump(P, open(f'{SITE}/data/planning.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print('buildings within 50 m of an SAC/SPA', n, '| permissions granted within 50 m', m, '| file', os.path.getsize(f'{SITE}/data/protected.json') // 1024, 'KB')
