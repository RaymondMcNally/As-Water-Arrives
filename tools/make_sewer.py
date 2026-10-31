"""Sligo & Environs sewer network (2008, MapInfo TAB, Irish Grid TM65) -> data/sewer.json for the site.
Usage: python3 make_sewer.py <folder with the SLIGO SEWER NETWORK_*.tab files> <site/data>
- Reprojected from Irish Grid (EPSG:29902) to ITM, then shifted 6.5 m west and 5 m north: the shift that puts the
  fewest pipe points inside building footprints (9.3% -> 2.3%), a usual error in old Irish Grid data.
- Each pipe is turned to run downstream, using the network's flow arrows (two strokes meeting at the tip).
- Only the part within 100 m of the model's circle is kept."""
import sys, json, numpy as np, pandas as pd, geopandas as gpd, pyogrio, shapely
from shapely.geometry import Point
G, OUT = sys.argv[1], sys.argv[2]
DX, DY = -6.5, 5.0
M = json.load(open(f'{OUT}/model.json')); CX, CY = M['centre']; R = M['radius']
circ = Point(CX, CY).buffer(R + 100)
def rd(n): return gpd.GeoDataFrame(pyogrio.read_dataframe(f'{G}/SLIGO SEWER NETWORK_{n}.tab')).set_crs(29902, allow_override=True).to_crs(2157).translate(DX, DY)
pipes = pd.concat([rd('LINK_SINGLE'), rd('LINK_PARALLEL')], ignore_index=True)
# arrows: group strokes by tip; direction = tip - mean of the stroke starts
arr = rd('FLOW_ARROW'); tips = {}
for g in arr:
    c = np.array(g.coords); k = tuple(np.round(c[-1], 1)); tips.setdefault(k, []).append(c[0])
A = [(np.array(k), np.array(k) - np.mean(v, axis=0)) for k, v in tips.items() if len(v) >= 2]
print(len(A), 'arrows')
tree = shapely.STRtree(pipes.values)
votes = np.zeros(len(pipes))
for tip, d in A:
    mid = tip - d / 2; i = tree.nearest(Point(mid)); g = pipes.values[i]
    if g.distance(Point(mid)) > 6: continue
    s = g.project(Point(mid)); a = g.interpolate(max(0, s - 1)); b = g.interpolate(min(g.length, s + 1))
    t = np.array([b.x - a.x, b.y - a.y]); votes[i] += np.sign(t @ d)
print('pipes with a direction', int((votes != 0).sum()), 'of', len(pipes))
out = []
for g, v in zip(pipes.values, votes):
    g = g.intersection(circ)
    if g.is_empty: continue
    parts = list(g.geoms) if g.geom_type == 'MultiLineString' else [g] if g.geom_type == 'LineString' else []
    for p in parts:
        c = [(round(x, 1), round(y, 1)) for x, y in p.coords]
        if v < 0: c = c[::-1]
        out.append({'c': [v for xy in c for v in xy], 'f': 1 if v != 0 else 0})
pts = {}
for n, key in [('OUTFALL', 'outfall'), ('WEIR', 'weir'), ('ORIFICE', 'orifice')]:
    g = rd(n); pts[key] = [[round(q.centroid.x, 1), round(q.centroid.y, 1)] for q in g if q.centroid.within(circ)]
nd = rd('NODE'); mh = sorted({(round(q.x, 1), round(q.y, 1)) for q in nd if q.geom_type == 'Point' and q.within(circ)})
L = sum(shapely.LineString(np.array(o['c']).reshape(-1, 2)).length for o in out)
J = {'source': 'Sligo & Environs sewer network, 2008 (MapInfo), Sligo County Council', 'crs': 'EPSG:2157',
     'note': 'Irish Grid to ITM, shifted 6.5 m west and 5 m north to fit the building footprints. Pipes run downstream where the flow arrows say so (f=1).',
     'pipes': out, 'manholes': [list(x) for x in mh], **pts}
s = json.dumps(J, separators=(',', ':')); open(f'{OUT}/sewer.json', 'w').write(s)
print(len(out), 'pipe pieces,', round(L / 1000, 1), 'km,', len(mh), 'manholes,', {k: len(v) for k, v in pts.items()}, len(s) // 1024, 'KB')
