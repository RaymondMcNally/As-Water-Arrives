"""Planning applications in the model's circle (Department of Housing national planning applications, Sligo County
Council, ePlanning from 2017) -> data/planning.json for the kiosk's timeline.
Usage: python3 make_planning.py <site outlines .json> <points .json> <site>
Kept: the site outline (or point), year decided (year received if undecided), decision, a type read from the
description, homes (read from the description, since NumResidentialUnits is often wrong), floor area, a short
description and the ePlanning link. Left out: applicant names and addresses. Each site is checked against today's
OPW flood zones (sea 1 in 100 years, river 1%) and the sea at +1.0 m (1 in 100 years, about 2100)."""
import sys, json, re, datetime, geopandas as gpd, shapely
from shapely.geometry import shape, Point
from shapely.ops import unary_union
SITES, PTS, SITE = sys.argv[1:4]
M = json.load(open(f'{SITE}/data/model.json')); CX, CY = M['centre']; R = M['radius']; circ = Point(CX, CY).buffer(R)
yr = lambda v: datetime.datetime.fromtimestamp(int(v) / 1000, datetime.UTC).year if v not in (None, 'None', '') else None
NUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'single': 1, 'a': 1}
def homes(d):
    d = d.lower(); best = 0
    for m in re.finditer(r'\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s*(?:sq|m2|m²|square|metre|meter|hectare|ha\b|acre|kw|%|mm|cm|m\b|bed|storey|story|year|month|car|space|parking|child|pupil|student|room))\s*(?:no\.?|number of|nos\.?)?\s*(?:[a-z\-]+\s){0,5}?(dwelling|house|apartment|residential unit|unit|home|duplex|townhouse)', d):
        n = int(m.group(1)) if m.group(1).isdigit() else NUM.get(m.group(1), 0)
        if n < 400: best = max(best, n)
    return best
def kind(p, d):
    d = d.lower(); new = re.search(r'\b(construct|construction|erect|build|new)\b', d)
    resid = re.search(r'dwelling|house|apartment|residential|duplex|home', d)
    if p.get('OneOffHouse') == 'Y' or (new and resid and not re.search(r'extension to (the )?(existing|rear|side)|extension of (the )?existing', d)): return 'homes'
    if 'change of use' in d or 'change the use' in d: return 'change'
    if re.search(r'extension|alteration|renovat|refurbish|attic|dormer|porch|sun ?room|conservatory|garage', d) and resid: return 'ext'
    if re.search(r'sign|solar|mast|antenna|fence|gate|wall|shed|retention of window|telecom', d) and not re.search(r'office|shop|retail|hotel|school|hospital|warehouse|factory|restaurant|bar|childcare|church|college|university|clinic', d): return 'minor'
    return 'com'
S = {f['properties']['ApplicationNumber']: f for f in json.load(open(SITES))['features']}
for f in json.load(open(PTS))['features']: S.setdefault(f['properties']['ApplicationNumber'], f)
rows = []
for app, f in S.items():
    p = f['properties']; d = p['DevelopmentDescription'] or ''
    dec = 'granted' if p['Decision'] in ('CONDITIONAL', 'UNCONDITIONAL', 'GRANTED') else 'refused' if p['Decision'] == 'REFUSED' else 'other'
    y = yr(p['DecisionDate']) or yr(p['GrantDate']) or yr(p['ReceivedDate'])
    k = kind(p, d); h = homes(d) if k in ('homes', 'change') else 0
    if k == 'homes' and h == 0: h = 1
    rows.append({'app': app, 'y': y, 'yr': yr(p['ReceivedDate']), 'dec': dec, 'type': p['ApplicationType'].title(), 'k': k, 'h': h,
                 'fa': round(float(p['FloorArea'] or 0)), 'd': re.sub(r'\s+', ' ', d).strip()[:220], 'url': p['LinkAppDetails'], 'geometry': shape(f['geometry'])})
G = gpd.GeoDataFrame(rows, crs=4326).to_crs(2157); G = G[G.intersects(circ)].copy()
fut = json.load(open(f'{SITE}/data/opw_future.json'))['features']; opw = json.load(open(f'{SITE}/data/opw_flood.json'))['features']
ll = lambda fs: gpd.GeoSeries([shape(x['geometry']) for x in fs], crs=4326).to_crs(2157).union_all()
today = ll([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 0 and x['properties']['rp'] == 100] + [x for x in opw if x['properties']['aep'] == 1])
plus1 = ll([x for x in fut if x['properties']['src'] == 'coast' and x['properties']['level'] == 1 and x['properties']['rp'] == 100])
G['fz'] = G.intersects(today).astype(int); G['fz1'] = G.intersects(plus1).astype(int)
def geo(g):
    g = g.simplify(0.5)
    if g.geom_type == 'Point': return {'p': [round(g.x, 1), round(g.y, 1)]}
    polys = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    return {'r': [[round(v, 1) for xy in q.exterior.coords for v in xy] for q in polys], 'p': [round(g.representative_point().x, 1), round(g.representative_point().y, 1)]}
out = [dict({k: r[k] for k in ('app', 'y', 'dec', 'type', 'k', 'h', 'fa', 'd', 'url', 'fz', 'fz1')}, **geo(r.geometry)) for _, r in G.sort_values('y').iterrows()]
for o in out: o['fz'] = int(o['fz']); o['fz1'] = int(o['fz1']); o['y'] = int(o['y'])
J = {'source': 'Department of Housing, Local Government and Heritage: National Planning Applications (CC BY 4.0), Sligo County Council ePlanning, downloaded November 2026',
     'years': [min(o['y'] for o in out), max(o['y'] for o in out)], 'apps': out}
json.dump(J, open(f'{SITE}/data/planning.json', 'w'), separators=(',', ':'), ensure_ascii=False, allow_nan=False)
import collections
g = [o for o in out if o['dec'] == 'granted']
print(len(out), 'in circle;', collections.Counter(o['dec'] for o in out))
print('granted by type', collections.Counter(o['k'] for o in g), 'homes granted', sum(o['h'] for o in g))
print('granted by year', sorted(collections.Counter(o['y'] for o in g).items()))
print('homes granted by year', sorted({y: sum(o['h'] for o in g if o['y'] == y) for y in set(o['y'] for o in g)}.items()))
print('granted in today\'s flood zones', sum(o['fz'] for o in g), 'homes', sum(o['h'] for o in g if o['fz']), '| in +1 m zone', sum(o['fz1'] for o in g), 'homes', sum(o['h'] for o in g if o['fz1']))
print('biggest', sorted([(o['h'], o['dec'], o['y'], o['d'][:70]) for o in out], reverse=True)[:8])
