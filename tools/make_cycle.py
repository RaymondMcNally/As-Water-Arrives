"""Cycling in Sligo from OpenStreetMap (an Overpass Turbo export) -> data/cycle.json and building field dc.
Usage: python3 make_cycle.py <export.geojson> <site>
Kinds: track = a cycle track away from traffic (highway=cycleway, or cycleway=track on the road);
path = a path shared with walkers where cycling is allowed (path/footway/pedestrian/track with bicycle=yes/designated);
lane = a painted cycle lane on the road; shared = a shared lane or bus lane. A road tagged cycleway=separate is skipped:
its track is mapped as its own line. Bike parking: amenity=bicycle_parking. dc = metres from a building to the nearest
track, path or lane."""
import sys, json, geopandas as gpd, shapely
from shapely.geometry import Point, shape
X, SITE = sys.argv[1:3]
M = json.load(open(f'{SITE}/data/model.json')); CX, CY = M['centre']; R = M['radius']; circ = Point(CX, CY).buffer(R + 100)
J = json.load(open(X))
def kind(p):
    h = p.get('highway'); cw = [p.get(k, '') for k in ('cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both')]
    if h == 'cycleway' or 'track' in cw: return 'track'
    if h in ('path', 'footway', 'pedestrian', 'track', 'bridleway') and p.get('bicycle') in ('yes', 'designated'): return 'path'
    if 'lane' in cw: return 'lane'
    if 'shared_lane' in cw or 'share_busway' in cw: return 'shared'
    return None
rows, park = [], []
for f in J['features']:
    p = f['properties']; g = shape(f['geometry'])
    if p.get('amenity') == 'bicycle_parking':
        rows_p = g.centroid; park.append((rows_p, int(p['capacity']) if str(p.get('capacity', '')).isdigit() else None)); continue
    k = kind(p)
    if k and g.geom_type in ('LineString', 'MultiLineString'): rows.append({'kind': k, 'name': p.get('name'), 'geometry': g})
G = gpd.GeoDataFrame(rows, crs=4326).to_crs(2157); G['geometry'] = G.geometry.intersection(circ); G = G[~G.geometry.is_empty].explode(index_parts=False)
P = gpd.GeoDataFrame({'cap': [c for _, c in park]}, geometry=[g for g, _ in park], crs=4326).to_crs(2157); P = P[P.within(circ)]
C0 = Point(CX, CY).buffer(R)
km = {k: round(G[G.kind == k].intersection(C0).length.sum() / 1000, 1) for k in ('track', 'path', 'lane', 'shared')}
out = {'source': '© OpenStreetMap contributors (ODbL), Overpass export ' + J.get('timestamp', ''), 'crs': 'EPSG:2157', 'km': km,
       'lines': [{'k': r.kind, 'n': r.name if isinstance(r.name, str) else None, 'c': [round(v, 1) for xy in r.geometry.coords for v in xy]} for r in G.itertuples() if r.geometry.geom_type == 'LineString'],
       'parking': [[round(g.x, 1), round(g.y, 1), c] for g, c in zip(P.geometry, P.cap)]}
out['km'] = {k: float(v) for k, v in km.items()}; out['parking'] = [[x, y, int(c) if c == c and c is not None else None] for x, y, c in out['parking']]
json.dump(out, open(f'{SITE}/data/cycle.json', 'w'), separators=(',', ':'), ensure_ascii=False, allow_nan=False)
print('km in circle', km, len(out['lines']), 'lines', len(out['parking']), 'bike parks')
# distance from each building to the nearest track, path or lane
from pyproj import Transformer
tf = Transformer.from_crs(4326, 2157, always_xy=True).transform
net = shapely.STRtree(list(G[G.kind.isin(['track', 'path', 'lane'])].geometry))
B = json.load(open(f'{SITE}/data/buildings.json'))
pts = [shapely.ops.transform(tf, shape(f['geometry']).representative_point()) for f in B['features']]
import shapely.ops
idx = net.nearest(pts); geoms = net.geometries
for f, q, i in zip(B['features'], pts, idx): f['properties']['dc'] = round(geoms[i].distance(q))
json.dump(B, open(f'{SITE}/data/buildings.json', 'w'), separators=(',', ':'))
homes = [f['properties'] for f in B['features'] if (f['properties'].get('nr') or 0) > 0]
print('buildings with homes', len(homes), 'more than 400 m from a route', sum(1 for p in homes if p['dc'] > 400))
