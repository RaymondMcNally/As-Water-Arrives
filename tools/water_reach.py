"""Spill levels: the lowest water level (m OD) at which water spreading over the ground from the sea / from Lough Gill reaches each cell."""
import sys, numpy as np, rasterio, geopandas as gpd
from rasterio.features import rasterize
from skimage.morphology import reconstruction
S = sys.argv[1]; out = sys.argv[2]
r = rasterio.open(f"{S}/out/Sligo_DTM_filled_2m_ITM.tif"); Z = r.read(1).astype("float64"); T = r.transform
W = gpd.read_file(f"{S}/out/water_model.gpkg", layer="water")
sea = W[W.level_m < 1.2]; lake = W[(W.level_m > 3.0) & (W.level_m < 4.5) & (W.area > 5e4)]
print("sea bodies", len(sea), round(sea.area.sum()/1e4), "ha; lake bodies", len(lake), round(lake.area.sum()/1e4), "ha", lake.level_m.round(2).tolist())
tidal = rasterize(((g, 1) for g in W[W.level_m < 3.0].geometry), out_shape=Z.shape, transform=T, dtype="uint8").astype(bool)
def spill(polys, level, wall=None):
    m = rasterize(((g, 1) for g in polys.geometry), out_shape=Z.shape, transform=T, dtype="uint8").astype(bool)
    mask = Z.copy(); mask[m] = np.minimum(Z[m], level)
    if wall is not None: mask[wall & ~m] = Z.max() + 50          # the lake cannot spill into the tidal river / sea
    seed = np.full_like(Z, Z.max() + 100); seed[m] = mask[m]
    return reconstruction(seed, mask, method="erosion").astype("float32")
Rs = spill(sea, 0.5); Rl = spill(lake, 3.8, tidal)
prof = r.profile; prof.update(count=2, dtype="float32", nodata=None, compress="deflate", predictor=3)
with rasterio.open(out, "w", **prof) as w: w.write(Rs, 1); w.write(Rl, 2)
for lv in (2, 3, 4, 5): print(f"sea at {lv} m OD reaches", round(float((Rs <= lv).sum()) * 4 / 1e4), "ha")
for lv in (5, 6, 7): print(f"lake at {lv} m OD reaches", round(float((Rl <= lv).sum()) * 4 / 1e4), "ha")
