"""Build the data folder for the A-IARG 2027 Sligo model website.

Inputs: God's Eye public data (split from the published page), the tile-generator outputs (buildings with heights,
water model, OSM roads, filled DTM, spill levels). Everything public: no addresses, no individual sale prices.
Run: python make_data.py <scratchpad> <god's-eye dir> <site dir>
"""
import sys, json, os, numpy as np, pandas as pd, geopandas as gpd, rasterio, shapely
from rasterio.features import rasterize, shapes
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling
from shapely.geometry import shape, Point, mapping, box
from shapely.ops import unary_union, transform as stransform
from pyproj import Transformer

S, GE, SITE = sys.argv[1:4]
D = f"{SITE}/data"; os.makedirs(D, exist_ok=True); os.makedirs(f"{D}/model", exist_ok=True)
CX, CY, R = 569150.1, 835838.2, 2048.26
HALF = 2050.0; X0, Y0 = CX - HALF, CY - HALF; SIZE = 2 * HALF
circle = Point(CX, CY).buffer(R, 256)
to_ll = Transformer.from_crs(2157, 4326, always_xy=True).transform
to_itm = Transformer.from_crs(4326, 2157, always_xy=True).transform
def dump(obj, path):
    with open(path, "w") as f: json.dump(obj, f, separators=(",", ":"))
    print(f"{os.path.relpath(path, SITE):40s} {os.path.getsize(path)/1e6:6.2f} MB")
def rnd(g, nd=6):
    return shapely.set_precision(g, 10 ** -nd) if nd else g
def gj_ll(gdf, props, nd=6):
    feats = []
    for i, (g, p) in enumerate(zip(gdf.geometry, gdf[props].to_dict("records") if props else [{}] * len(gdf))):
        if g is None or g.is_empty: continue
        gl = shapely.set_precision(stransform(to_ll, g), 1e-6)
        feats.append({"type": "Feature", "id": i, "properties": {k: (None if (isinstance(v, float) and np.isnan(v)) else v) for k, v in p.items()}, "geometry": mapping(gl)})
    return {"type": "FeatureCollection", "features": feats}

# ---------------------------------------------------------------- 1. buildings: God's Eye public fields + water reach
gb = json.load(open(f"{GE}/d-buildings.json"))
bm = gpd.read_file(f"{S}/out/buildings_for_mesh.gpkg")
sp = rasterio.open(f"{S}/out/spill_levels.tif"); Rs = sp.read(1); Rl = sp.read(2)
L = rasterize(((g, i + 1) for i, g in enumerate(bm.geometry)), out_shape=Rs.shape, transform=sp.transform, all_touched=True, dtype="int32")
m = L > 0
fs = pd.Series(Rs[m]).groupby(L[m]).min(); fl = pd.Series(Rl[m]).groupby(L[m]).min()
bm["fs"] = [fs.get(i + 1, np.nan) for i in range(len(bm))]; bm["fl"] = [fl.get(i + 1, np.nan) for i in range(len(bm))]
W = gpd.read_file(f"{S}/out/water_model.gpkg", layer="water")
Wu = unary_union(W.geometry)
bm["dw"] = bm.geometry.distance(Wu)
look = bm.set_index("guid")[["fs", "fl", "dw", "h_model", "src"]].to_dict("index")
miss = 0
for f in gb["features"]:
    p = f["properties"]; x = look.get(p["g"])
    if x is None: miss += 1; continue
    p["fs"] = None if np.isnan(x["fs"]) or x["fs"] > 60 else round(float(x["fs"]), 2)     # sea level (m OD) that first reaches it
    p["fl"] = None if np.isnan(x["fl"]) or x["fl"] > 60 else round(float(x["fl"]), 2)     # Lough Gill level (m OD)
    p["dw"] = round(float(x["dw"]))                                                       # metres to water
    p["h"] = round(float(x["h_model"]), 1)                                                # corrected height (lidar caps)
    if x["src"] != "attributes": p["h_est"] = 1
print("buildings", len(gb["features"]), "unmatched", miss)
# keep only buildings that touch the borough circle plus a margin (the kiosk is about the model)
keep = []
for f in gb["features"]:
    c = shape(f["geometry"]).representative_point(); E, N = to_itm(c.x, c.y)
    if (E - CX) ** 2 + (N - CY) ** 2 <= (R + 150) ** 2: keep.append(f)
for i, f in enumerate(keep): f["id"] = i
gb["features"] = keep
dump(gb, f"{D}/buildings.json")

# ---------------------------------------------------------------- 2. God's Eye context layers, copied as published
for k in ("areas", "zoning", "roads", "context", "meta"):
    src = json.load(open(f"{GE}/d-{k}.json")); dump(src, f"{D}/{k}.json")

# ---------------------------------------------------------------- 3. water today and the two rising-water scenarios
W["kind"] = np.where(W.level_m < 1.2, "sea", np.where(W.level_m < 3.0, "tidal river", "lake / upper river"))
dump(gj_ll(W.assign(level=W.level_m.round(2)), ["kind", "level"]), f"{D}/water.json")
clip = circle.buffer(300)
win = rasterio.windows.from_bounds(*clip.bounds, transform=sp.transform)
Ts = sp.window_transform(win); Rs_w = sp.read(1, window=win); Rl_w = sp.read(2, window=win)
feats = []
for src, Rw, levels in (("sea", Rs_w, [2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]), ("lake", Rl_w, [4.5, 5.0, 5.5, 6.0, 7.0, 8.0])):
    for lv in levels:
        msk = (Rw <= lv).astype("uint8")
        polys = [shape(g) for g, v in shapes(msk, mask=msk.astype(bool), transform=Ts, connectivity=8) if v == 1]
        u = unary_union(polys).buffer(1).buffer(-1).simplify(1.5).intersection(clip)
        u = u.difference(Wu.buffer(-0.5)) if src == "lake" else u
        if u.is_empty: continue
        feats.append({"type": "Feature", "properties": {"src": src, "level": lv, "ha": round(u.area / 1e4)}, "geometry": mapping(shapely.set_precision(stransform(to_ll, u), 1e-6))})
        print(f"  {src} {lv} m OD: {u.area/1e4:.0f} ha")
dump({"type": "FeatureCollection", "features": feats}, f"{D}/flood.json")

# ---------------------------------------------------------------- 4. the model: circle, tiles, scheme
tiles = gpd.read_file(f"{S}/out/borough_1-2500.gpkg", layer="tiles")
prop = gpd.read_file(f"{S}/out/Proposal_Garavogue_Crossing.gpkg")
model = {"centre": [CX, CY], "radius": R, "scale": 2500, "tile_mm": 230, "tile_m": 575, "origin": [X0, Y0], "size": SIZE,
         "centre_name": "Lady Erin (1798 monument), Market Street",
         "circle": mapping(stransform(to_ll, circle.simplify(0.5))),
         "tiles": [{"ref": r.ref, "id": r.tile, "x0": float(r.x0), "y0": float(r.y0), "full": bool(r.full)} for r in tiles.itertuples()],
         "scheme": mapping(stransform(to_ll, prop[prop.part == "road footprint"].geometry.iloc[0].simplify(0.3)))}
dump(model, f"{D}/model.json")

# ---------------------------------------------------------------- 5. terrain grids (local metres from the SW corner of the 4.1 km square)
dtm = rasterio.open(f"{S}/out/Sligo_DTM_filled_2m_ITM.tif")
def grid(step):
    n = int(round(SIZE / step)) + 1
    G = np.full((n, n), np.nan, "float32")
    tr = from_origin(X0 - step / 2, Y0 + SIZE + step / 2, step, step)           # pixel centres on the grid nodes, row 0 = north
    reproject(dtm.read(1), G, src_transform=dtm.transform, src_crs=dtm.crs, dst_transform=tr, dst_crs=dtm.crs, resampling=Resampling.bilinear, dst_nodata=np.nan)
    G = np.flipud(G)                                                             # row 0 = south
    return n, np.where(np.isfinite(G), G, 0)
for step, name in ((2.0, "dtm2m"), (8.0, "dtm8m")):
    n, G = grid(step)
    q = np.clip(np.round(G * 100), -32000, 32000).astype("<i2")                 # centimetres
    q.tofile(f"{D}/model/{name}.bin")
    print(f"data/model/{name}.bin  {n}×{n}  {os.path.getsize(f'{D}/model/{name}.bin')/1e6:.2f} MB  range {G.min():.1f}–{G.max():.1f} m")
dump({"origin": [X0, Y0], "size": SIZE, "grids": {"dtm2m": {"n": int(SIZE / 2) + 1, "step": 2.0}, "dtm8m": {"n": int(SIZE / 8) + 1, "step": 8.0}},
      "units": "Int16 centimetres, little-endian, row 0 = south, column 0 = west, nodes on the grid", "datum": "m OD (Malin Head)"}, f"{D}/model/terrain.json")

# hillshade for the kiosk and the projector base (2 m, north up, 8-bit PNG)
from matplotlib.colors import LightSource
from PIL import Image
n, G = grid(2.0)
hs = LightSource(azdeg=315, altdeg=40).hillshade(np.flipud(G), vert_exag=2.5, dx=2, dy=2)
Image.fromarray((hs * 255).astype("uint8")).save(f"{D}/hillshade.png", optimize=True)
print("data/hillshade.png", os.path.getsize(f"{D}/hillshade.png") / 1e6, "MB")

# ---------------------------------------------------------------- 6. vector data for the model maker (local metres, 0.1 m)
L0 = lambda g: shapely.affinity.translate(g, -X0, -Y0)
q1 = lambda c: [round(c[0], 1), round(c[1], 1)]
def rings(g):
    out = []
    for p in getattr(g, "geoms", [g]):
        if p.geom_type != "Polygon" or p.is_empty: continue
        out.append([[q1(c) for c in p.exterior.coords[:-1]]] + [[q1(c) for c in r.coords[:-1]] for r in p.interiors])
    return out
area_box = box(X0, Y0, X0 + SIZE, Y0 + SIZE)
bmc = bm[bm.intersects(area_box)]
B = [[round(float(h), 2), round(float(g0), 2), rings(L0(geo.simplify(0.1)))] for geo, h, g0 in zip(bmc.geometry, bmc.h_model, bmc.terr_med)]
B = [b for b in B if b[2]]
dump({"fields": ["height_m", "ground_m_OD", "polygons"], "items": B}, f"{D}/model/buildings.json")
RD = gpd.read_file(f"{S}/out/osm_roads_sligo.gpkg")
widths = {"trunk": 12, "trunk_link": 8, "primary": 10, "primary_link": 7, "secondary": 9, "secondary_link": 7, "tertiary": 8, "tertiary_link": 7,
          "residential": 6, "unclassified": 6, "living_street": 5, "pedestrian": 5, "service": 4}
RD = RD[RD.fclass.isin(widths)]
RD = RD[RD.intersects(area_box)]
road = unary_union([g.buffer(widths[c] / 2, cap_style=2, join_style=1, quad_segs=4) for g, c in zip(RD.geometry, RD.fclass)]).simplify(0.15).intersection(area_box)
dump({"polygons": rings(L0(road))}, f"{D}/model/roads.json")
Wc = W[W.intersects(area_box)]
dump({"items": [[round(float(lv), 2), rings(L0(g.intersection(area_box).simplify(0.2)))] for g, lv in zip(Wc.geometry, Wc.level_m)]}, f"{D}/model/water.json")
pf = prop[prop.part == "road footprint"].geometry.iloc[0]; bd = prop[prop.part == "bridge deck"].geometry.iloc[0]
dump({"road": rings(L0(pf.simplify(0.15))), "deck": rings(L0(bd))}, f"{D}/model/scheme.json")
