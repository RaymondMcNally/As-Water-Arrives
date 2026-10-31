"""OPW river flood extents (floodinfo.ie) for the site: three bands clipped to the borough, and each building's band."""
import sys, glob, json, numpy as np, pyogrio, geopandas as gpd, shapely
from shapely.geometry import Point, mapping
from shapely.ops import unary_union, transform as stransform
from pyproj import Transformer
A, S, SITE = sys.argv[1:4]
to_ll = Transformer.from_crs(2157, 4326, always_xy=True).transform
C = Point(569150.1, 835838.2).buffer(2048.26, 256)
bands = []
for f in sorted(glob.glob(f"{A}/*River_Sligo*.gpkg")):
    name = pyogrio.list_layers(f)[0][0]; aep = 10 if "10%" in name else 5 if "5%" in name else 1
    d = gpd.read_file(f, layer=name).to_crs(2157)
    g = unary_union(shapely.force_2d(d.geometry).make_valid()).intersection(C.buffer(300)).buffer(0.5).buffer(-0.5).simplify(0.8)
    bands.append((aep, g)); print(name, aep, round(g.intersection(C).area / 1e4, 1), "ha in circle")
bands.sort(key=lambda b: -b[0])
lab = {10: "High probability: 10% chance each year (about 1 in 10)", 5: "Medium probability: 5% chance each year (about 1 in 20)", 1: "Low probability: 1% chance each year (about 1 in 100)"}
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"aep": a, "ha": round(g.intersection(C).area / 1e4), "label": lab[a]},
      "geometry": mapping(shapely.set_precision(stransform(to_ll, g), 1e-6))} for a, g in bands]}
json.dump(fc, open(f"{SITE}/data/opw_flood.json", "w"), separators=(",", ":"))
# each building: the most likely band its footprint touches
bm = gpd.read_file(f"{S}/out/buildings_for_mesh.gpkg")
op = {}
for a, g in sorted(bands, key=lambda b: b[0]):          # 1, 5, 10: later (more likely) bands overwrite
    hit = bm[bm.intersects(g)]
    for gu in hit.guid: op[gu] = a
B = json.load(open(f"{SITE}/data/buildings.json"))
n = {10: 0, 5: 0, 1: 0}
for ft in B["features"]:
    v = op.get(ft["properties"]["g"]); ft["properties"]["op"] = v
    if v: n[v] += 1
json.dump(B, open(f"{SITE}/data/buildings.json", "w"), separators=(",", ":"))
print("buildings by most likely band", n)
