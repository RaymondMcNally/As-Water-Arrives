"""Sligo County Council Water Services GIS (MapInfo, Irish Grid TM65) -> data/watermains.json, and the treatment
plants near the model added to data/sewer.json. With a third argument, the 2008 Sligo & Environs water model folder,
its supply zones (Zone_bnd Final 23, with the source that feeds each) and reservoirs are added; that model fits the
building footprints best moved 2 m east and 4 m north.
Usage: python3 make_watermains.py <Water_Services_GIS folder> <site/data> [<Sligo and Environs Water Network folder>]
The public water pipes (PWPipeobj_Nov07) fit the building footprints with no shift (1.2% of points inside buildings),
unlike the 2008 town sewer file. Pipes are kept within 100 m of the model's circle; plants within 3 km of Lady Erin."""
import sys, json, pyogrio, geopandas as gpd, shapely
from shapely.geometry import Point
G, OUT = sys.argv[1], sys.argv[2]
M = json.load(open(f'{OUT}/model.json')); CX, CY = M['centre']; R = M['radius']; circ = Point(CX, CY).buffer(R + 100)
def rd(n): return gpd.GeoDataFrame(pyogrio.read_dataframe(f'{G}/{n}')).set_crs(29902, allow_override=True).to_crs(2157)
w = rd('Water_Network/PWPipeobj_Nov07.TAB'); out = []
for g in w.geometry:
    g = g.intersection(circ)
    for p in (g.geoms if hasattr(g, 'geoms') else [g]):
        if p.geom_type == 'LineString' and p.length > 0: out.append({'c': [round(v, 1) for xy in p.coords for v in xy], 'f': 0})
near = lambda g: g.distance(Point(CX, CY)) < 3000
wt = rd('Water_Network/Water_Treatment_WorksMar08.TAB'); works = [{'name': r.ID.replace(' WTW', ' water treatment works'), 'xy': [round(r.geometry.x, 1), round(r.geometry.y, 1)]} for r in wt.itertuples() if near(r.geometry)]
J = {'source': 'Sligo County Council Water Services GIS, public water pipes, November 2007', 'crs': 'EPSG:2157', 'pipes': out, 'outfall': [], 'weir': [], 'plants': works}
if len(sys.argv) > 3:
    WN = sys.argv[3]; SRC = {'FOX': 'Foxes Den', 'K': 'Kilsellagh', 'C': 'Cairns Hill', 'F': 'F (as recorded)'}
    z = gpd.GeoDataFrame(pyogrio.read_dataframe(f'{WN}/Zone_bnd Final 23.TAB')).set_crs(29902, allow_override=True).to_crs(2157); z['geometry'] = z.translate(2, 4)
    zones = []
    for r in z.itertuples():
        g = shapely.make_valid(r.geometry).intersection(circ).simplify(1.0)
        polys = [q for q in (g.geoms if hasattr(g, 'geoms') else [g]) if q.geom_type == 'Polygon' and q.area > 50]
        if not polys: continue
        code = (r.Water_Supply or '').strip().upper()
        zones.append({'name': r.Name.strip().title().replace('Finislklin', 'Finisklin').replace('Finsklin', 'Finisklin').replace('Carins', 'Cairns').replace('Wofle', 'Wolfe').replace('St. Columbas', "St Columba's").replace('5" High Pressure From Kilsellagh', 'High-pressure main from Kilsellagh').replace(' Wsa', ' WSA').replace(' And ', ' and ').replace('12" Connonlly Street', 'Connolly Street (12-inch main)'),
                      'src': code, 'srcName': SRC.get(code, code), 'r': [[round(v, 1) for xy in q.exterior.coords for v in xy] for q in polys]})
    t = gpd.GeoDataFrame(pyogrio.read_dataframe(f'{WN}/SLIGONETWORK_TANKS.tab')).set_crs(29902, allow_override=True).to_crs(2157); t['geometry'] = t.translate(2, 4)
    tanks = [[round(q.centroid.x, 1), round(q.centroid.y, 1)] for q in t.geometry if q.geom_type == 'Polygon' and q.centroid.within(circ)]
    J['zones'] = zones; J['tanks'] = tanks; J['zoneSource'] = 'Sligo & Environs water network model, 2008: supply zones and reservoirs'
    print(len(zones), 'supply zones,', len(tanks), 'reservoirs in the circle')
open(f'{OUT}/watermains.json', 'w').write(json.dumps(J, separators=(',', ':')))
pl = rd('Sewer_Network/Location_Treatment_PlantsMar08.TAB'); plants = []
for r in pl.itertuples():
    if not near(r.geometry): continue
    plants.append({'name': f'{r.Plant_Name} wastewater treatment plant', 'xy': [round(r.geometry.x, 1), round(r.geometry.y, 1)], 'pe': int(r.Design_PE or 0), 'to': r.Discharge_to__, 'treatment': r._6})
S = json.load(open(f'{OUT}/sewer.json')); S['plants'] = plants; open(f'{OUT}/sewer.json', 'w').write(json.dumps(S, separators=(',', ':')))
print(len(out), 'water pipe pieces,', round(sum(shapely.LineString([o['c'][i:i + 2] for i in range(0, len(o['c']), 2)]).length for o in out) / 1000, 1), 'km;', works, plants)
