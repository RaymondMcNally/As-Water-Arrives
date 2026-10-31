"""Sligo borough 1:2500 tiles: 240 mm (600 m) tiles centred on Lady Erin, cut to one Irish mile.

Each tile is one watertight solid:
  terrain (survey DTM, gaps filled from OPW lidar), water recessed below its level,
  roads cut in, flat-roof buildings at main-roof height, curved edge on the circle,
  hollow ribbed underside with a solid label pad, magnet pockets on shared edges
  (seen from outside: LEFT pocket N-out, RIGHT pocket S-out; dimple under every N pocket).

Usage: python borough_tiles.py config.json [--tiles ID ...] [--proposal]
"""
import sys, json, argparse, numpy as np, geopandas as gpd, pandas as pd, rasterio, shapely, trimesh, manifold3d as mf
from rasterio.features import rasterize
from rasterio.transform import from_origin
from scipy.ndimage import map_coordinates
from shapely.geometry import Polygon, Point, box, LineString
from shapely.ops import unary_union
from shapely import affinity

ap = argparse.ArgumentParser(); ap.add_argument("config"); ap.add_argument("--tiles", nargs="*"); ap.add_argument("--proposal", action="store_true")
args = ap.parse_args(); C = json.load(open(args.config))
S = 1000.0 / C["scale"]                       # mm per metre (0.4 at 1:2500)
ZS = S * C.get("terrain_exaggeration", 1.0)
RES = C["grid_m"]; BASE = C["base_mm"]; DATUM = C["datum_m"]
CX, CY, R = C["centre"][0], C["centre"][1], C["radius_m"]
circle = Point(CX, CY).buffer(R, 512)
tiles = gpd.read_file(C["tiles"], layer="tiles"); tiles["x0"] = tiles.x0.astype(float); tiles["y0"] = tiles.y0.astype(float)
T = C["tile_m"]; TMM = T * S
keyset = {(round((x - CX) / T), round((y - CY) / T)) for x, y in zip(tiles.x0, tiles.y0)}

# ---------- data ----------
dtm = rasterio.open(C["dtm"]); DZ = dtm.read(1); DT = ~dtm.transform
W = gpd.read_file(C["water"], layer="water")
B = gpd.read_file(C["buildings"]); B = B[B.roof.notna()]
RD = gpd.read_file(C["roads"])
RD = RD[RD.fclass.isin(C["road_widths_m"].keys())].copy(); RD["w"] = RD.fclass.map(C["road_widths_m"])
PROP = None
if args.proposal:
    PROP = gpd.read_file(C["proposal"], layer="proposal")

def sample_dtm(X, Y):
    c, r = DT * (X, Y)
    return map_coordinates(DZ, [r - 0.5, c - 0.5], order=1, mode="nearest")

def tm2mf(m):
    return mf.Manifold(mf.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))

def mf2tm(m):
    g = m.to_mesh(); return trimesh.Trimesh(np.asarray(g.vert_properties)[:, :3], np.asarray(g.tri_verts), process=False)

def prism(poly, z0, z1):
    out = None
    for p in getattr(poly, "geoms", [poly]):
        if p.is_empty or p.area < 1e-3: continue
        m = trimesh.creation.extrude_polygon(p, z1 - z0); m.apply_translation([0, 0, z0])
        out = tm2mf(m) if out is None else out + tm2mf(m)
    return out

def text_poly(txt, height_mm):
    from matplotlib.textpath import TextPath
    from matplotlib.font_manager import FontProperties
    tp = TextPath((0, 0), txt, size=height_mm, prop=FontProperties(family="DejaVu Sans", weight="bold"))
    polys = [Polygon(p) for p in tp.to_polygons() if len(p) > 2]
    shape = Polygon()
    for p in sorted(polys, key=lambda p: -p.area):            # even-odd: holes inside letters
        shape = shape.symmetric_difference(p.buffer(0))
    return shape

def heightfield_solid(Zmm):
    """Closed solid from a (ny, nx) grid of top heights, x/y spacing RES*S mm, bottom at z=0."""
    ny, nx = Zmm.shape; d = RES * S
    xs = np.arange(nx) * d; ys = np.arange(ny) * d
    X, Y = np.meshgrid(xs, ys)
    top = np.c_[X.ravel(), Y.ravel(), Zmm.ravel()]; n = len(top)
    bot = top.copy(); bot[:, 2] = 0
    V = np.vstack([top, bot]); idx = np.arange(n).reshape(ny, nx)
    a, b, c, e = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()
    F = [np.c_[a, b, c], np.c_[a, c, e], np.c_[a, c, b] + n, np.c_[a, e, c] + n]
    ring = np.r_[idx[0, :], idx[1:, -1], idx[-1, -2::-1], idx[-2:0:-1, 0]]   # anticlockwise around the boundary
    r2 = np.roll(ring, -1)
    F += [np.c_[ring, ring + n, r2], np.c_[r2, ring + n, r2 + n]]
    m = trimesh.Trimesh(V, np.vstack(F), process=False)
    if m.volume < 0: m.invert()
    return m

def mmpoly(g, x0, y0):
    return affinity.scale(affinity.translate(g, -x0, -y0), S, S, origin=(0, 0))

def union_prisms(items):
    """items: list of (polygon_mm, z0, z1) -> one Manifold (batch union)."""
    ms = []
    for poly, z0, z1 in items:
        m = prism(poly, z0, z1)
        if m is not None: ms.append(m)
    if not ms: return None
    return mf.Manifold.batch_boolean(ms, mf.OpType.Add) if len(ms) > 1 else ms[0]

def build_tile(row):
    x0, y0, tid = row.x0, row.y0, row.tile
    n = int(round(T / RES)) + 1
    xs = x0 + np.arange(n) * RES; ys = y0 + np.arange(n) * RES
    X, Y = np.meshgrid(xs, ys)
    H = sample_dtm(X, Y)
    Zmm = np.maximum(BASE + (H - DATUM) * ZS, BASE + 0.6)
    ZTOP = float(Zmm.max()) + 80
    terrain = tm2mf(heightfield_solid(Zmm))
    tb = box(x0 - 30, y0 - 30, x0 + T + 30, y0 + T + 30)
    clipmm = box(-5, -5, TMM + 5, TMM + 5)
    vec = lambda g: mmpoly(g.intersection(tb), x0, y0).intersection(clipmm)
    # ---- roads: exact OSM outlines, the draped surface lowered inside them ----
    rd = RD[RD.intersects(tb)]
    polys = [g.buffer(w / 2, cap_style=2, join_style=1, quad_segs=6) for g, w in zip(rd.geometry, rd.w)]
    if PROP is not None:
        pf = PROP[PROP.part == "road footprint"].geometry.iloc[0]
        if pf.intersects(tb): polys.append(pf)
    surf = terrain
    if polys:
        road = vec(unary_union(polys).simplify(0.1))
        if not road.is_empty:
            cut = C["road_cut_m"] * S
            low = tm2mf(heightfield_solid(np.maximum(Zmm - cut, BASE + 0.3)))
            rp = prism(road, -1, ZTOP)
            surf = (terrain - rp) + (low ^ rp)
    # ---- water: flat surface below each body's own level, exact outlines ----
    w = W[W.intersects(tb)]
    deck = None
    if PROP is not None:
        bd = PROP[PROP.part == "bridge deck"].geometry.iloc[0]
        if bd.intersects(tb): deck = bd
    items = []
    for g, lv in zip(w.geometry, w.level_m):
        if deck is not None: g = g.difference(deck)
        gp = vec(g.simplify(0.2))
        if gp.is_empty or gp.area < 0.2: continue
        items.append((gp, lv))
    if items:
        allw = unary_union([g for g, _ in items])
        wp = prism(allw, -1, ZTOP)
        slabs = union_prisms([(g, 0, max(BASE + (lv - DATUM) * ZS - C["water_recess_m"] * S, BASE + 0.3)) for g, lv in items])
        surf = (surf - wp) + (slabs ^ wp)
    # ---- buildings: extruded footprints, flat roofs; grown slightly with square corners to close slivers ----
    b = B[B.intersects(tb)]
    bitems = []
    grow = C["close_gaps_m"] / 2
    for g, hh, gr in zip(b.geometry, b.h_model, b.terr_med):
        gp = vec(g.simplify(0.1).buffer(-0.25, join_style=2, mitre_limit=3).buffer(0.25 + grow, join_style=2, mitre_limit=3))
        if gp.is_empty or gp.area < 0.3: continue
        top = BASE + (gr - DATUM) * ZS + hh * S      # sits on the terrain under it; ground exaggerated, building height true
        bitems.append((gp, C["cavity_height_mm"] + 1.0, top))
    solid = surf
    if bitems:
        bl = union_prisms(bitems)
        solid = solid + bl
    solid = solid ^ prism(box(0, 0, TMM, TMM), -1, ZTOP + 50)
    # tile outline in mm (local), cut to the circle
    to_mm = lambda g: affinity.scale(affinity.translate(g, -x0, -y0), S, S, origin=(0, 0))
    outline = box(0, 0, TMM, TMM).intersection(to_mm(circle))
    if outline.area < TMM * TMM - 1:
        solid = solid ^ prism(outline, -1, ZTOP + 50)
    # hollow underside: cavity inset from the walls, ribs, a solid label pad
    cav = outline.buffer(-C["wall_mm"], join_style=2)
    ribs = [box(x - C["rib_mm"] / 2, -1, x + C["rib_mm"] / 2, TMM + 1) for x in np.arange(C["rib_pitch_mm"], TMM, C["rib_pitch_mm"])]
    ribs += [box(-1, y - C["rib_mm"] / 2, TMM + 1, y + C["rib_mm"] / 2) for y in np.arange(C["rib_pitch_mm"], TMM, C["rib_pitch_mm"])]
    pc = outline.buffer(-30).centroid if outline.buffer(-30).area > 0 else outline.centroid
    if Point(TMM / 2, TMM / 2).within(outline.buffer(-45)): pc = Point(TMM / 2, TMM / 2)
    pw, ph = C["label_pad_mm"]; pad = box(pc.x - pw / 2, pc.y - ph / 2, pc.x + pw / 2, pc.y + ph / 2)
    cav = cav.difference(unary_union(ribs + [pad])).buffer(0)
    cav_parts = [p for p in getattr(cav, "geoms", [cav]) if p.area > 30]
    if cav_parts:
        solid = solid - prism(unary_union(cav_parts), -1, C["cavity_height_mm"])
    # label, debossed into the pad face and mirrored so it reads with the tile turned over
    ref = row.ref
    lab = unary_union([affinity.translate(text_poly(f"{ref}  1:{C['scale']}", 6.0), 0, 8), text_poly(tid, 4.0)])
    lab = affinity.scale(lab, -1, 1, origin=lab.centroid)
    lab = affinity.translate(lab, pc.x - lab.centroid.x, pc.y - lab.centroid.y)
    solid = solid - prism(lab, -1, C["label_depth_mm"])
    # magnet pockets on edges shared with a neighbour
    k = (round((x0 - CX) / T), round((y0 - CY) / T))
    disk = to_mm(circle).buffer(-C["magnets"]["edge_margin_mm"])
    md = C["magnets"]["diameter_mm"] + 2 * C["magnets"]["clearance_mm"]; mdep = C["magnets"]["thickness_mm"] + C["magnets"]["clearance_mm"]
    zc = C["magnets"]["centre_z_mm"]
    edges = {  # (neighbour offset, edge line, inward normal, 'left' direction seen from outside)
        "S": ((0, -1), LineString([(0, 0), (TMM, 0)]), (0, 1), (-1, 0)),
        "E": ((1, 0), LineString([(TMM, 0), (TMM, TMM)]), (-1, 0), (0, -1)),
        "N": ((0, 1), LineString([(0, TMM), (TMM, TMM)]), (0, -1), (1, 0)),
        "W": ((-1, 0), LineString([(0, 0), (0, TMM)]), (1, 0), (0, 1)),
    }
    pockets, n_pockets = [], 0
    for nm, (off, line, inw, left) in edges.items():
        if (k[0] + off[0], k[1] + off[1]) not in keyset: continue
        seg = line.intersection(disk)
        if seg.is_empty or seg.length < 60: continue
        a, b2 = np.asarray(seg.coords)[0], np.asarray(seg.coords)[-1]
        for t in (0.25, 0.75):
            p = a + t * (b2 - a)
            cyl = trimesh.creation.cylinder(radius=md / 2, height=2 * mdep, sections=48)
            if nm in ("S", "N"): cyl.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
            else: cyl.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
            cyl.apply_translation([p[0], p[1], zc]); pockets.append(tm2mf(cyl)); n_pockets += 1
            is_left = np.dot(p - (a + b2) / 2, left) > 0
            if is_left:   # N pocket: dimple on the underside just inside it
                q = p + np.array(inw) * (mdep + 1.8)
                dm = trimesh.creation.cylinder(radius=1.0, height=1.2, sections=24); dm.apply_translation([q[0], q[1], 0]); pockets.append(tm2mf(dm))
    for p in pockets: solid = solid - p
    m = mf2tm(solid)
    return m, dict(ref=ref, tile=tid, pockets=n_pockets, height_mm=round(float(m.bounds[1][2]), 1), min_terrain_mm=round(float(Zmm.min()), 1),
                   volume_cm3=round(m.volume / 1000, 1), watertight=bool(m.is_watertight), faces=len(m.faces),
                   edge=bool(outline.area < TMM * TMM - 1))

if __name__ == "__main__":
    sel = tiles if not args.tiles else tiles[tiles.tile.isin(args.tiles)]
    out = C["out_dir"] + ("_scheme" if args.proposal else ""); import os; os.makedirs(out, exist_ok=True)
    if args.proposal:
        pf = gpd.read_file(C["proposal"], layer="proposal").union_all()
        sel = sel[[box(r.x0, r.y0, r.x0 + T, r.y0 + T).intersects(pf) for r in sel.itertuples()]]
    rows = []
    for r in sel.itertuples():
        m, info = build_tile(r)
        m.export(f"{out}/{info['ref']}_{r.tile}.3mf"); rows.append(info); print(info, flush=True)
    mp = f"{out}/manifest.csv"
    old = pd.read_csv(mp) if os.path.exists(mp) else pd.DataFrame()
    new = pd.DataFrame(rows)
    if len(old): old = old[~old.tile.isin(new.tile)]
    pd.concat([old, new]).sort_values("ref").to_csv(mp, index=False)
