"""Sligo town buses (S1, S2, S3) from the Bus Éireann GTFS feed -> data/buses.json.
Usage: python3 make_buses.py <folder with the GTFS .txt files> <site/data>
Takes the trips running on a sample weekday, Saturday and Sunday, works out how far along its route line each stop is,
and packs each trip as (pattern, start time). Coordinates are ITM metres; times are seconds after midnight."""
import csv, json, sys, datetime, collections
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.ops import substring

G, OUT = sys.argv[1], sys.argv[2]
DAYS = {'wk': '20270311', 'sat': '20270313', 'sun': '20270314'}       # Thursday of the conference, then the weekend
COL = {'S1': '#ff4f7b', 'S2': '#d77bff', 'S3': '#a6f04a'}
rd = lambda n: list(csv.DictReader(open(f'{G}/{n}', encoding='utf-8-sig')))
tf = Transformer.from_crs(4326, 2157, always_xy=True)
routes = {r['route_id']: r for r in rd('routes.txt')}
RIDS = sorted(routes, key=lambda k: routes[k]['route_short_name'])
cal = rd('calendar.txt'); exc = collections.defaultdict(dict)
for r in rd('calendar_dates.txt'): exc[r['date']][r['service_id']] = r['exception_type']
def active(date):
    wd = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][datetime.datetime.strptime(date, '%Y%m%d').weekday()]
    s = {c['service_id'] for c in cal if c[wd] == '1' and c['start_date'] <= date <= c['end_date']}
    for sid, t in exc[date].items(): (s.add if t == '1' else s.discard)(sid)
    return s
sec = lambda t: (lambda h, m, s: h * 3600 + m * 60 + s)(*map(int, t.split(':')))
trips = rd('trips.txt'); st = collections.defaultdict(list)
for r in rd('stop_times.txt'): st[r['trip_id']].append(r)
stops = {s['stop_id']: s for s in rd('stops.txt')}
pts = collections.defaultdict(list)
for r in rd('shapes.txt'): pts[r['shape_id']].append((int(r['shape_pt_sequence']), float(r['shape_pt_lon']), float(r['shape_pt_lat'])))
shapes, sidx, lines = [], {}, {}
def shape(sid, rid):
    if sid in sidx: return sidx[sid]
    p = sorted(pts[sid]); xy = [tf.transform(lo, la) for _, lo, la in p]
    ln = LineString(xy).simplify(1.0); c = [(round(x), round(y)) for x, y in ln.coords]
    flat = list(c[0]); [flat.extend((c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1])) for i in range(1, len(c))]
    sidx[sid] = len(shapes); lines[sidx[sid]] = LineString(c); shapes.append({'r': RIDS.index(rid), 'c': flat}); return sidx[sid]
pats, pidx, out, used = [], {}, {}, {}
for day, date in DAYS.items():
    act = active(date); L = []
    for t in trips:
        if t['service_id'] not in act: continue
        s = sorted(st[t['trip_id']], key=lambda r: int(r['stop_sequence']))
        si = shape(t['shape_id'], t['route_id']); ln = lines[si]
        t0 = sec(s[0]['departure_time']); rel = [sec(r['arrival_time']) - t0 for r in s]
        key = (si, tuple(r['stop_id'] for r in s), tuple(rel))
        if key not in pidx:
            d, prev = [], 0.0
            for r in s:
                x, y = tf.transform(float(stops[r['stop_id']]['stop_lon']), float(stops[r['stop_id']]['stop_lat']))
                rest = substring(ln, prev, ln.length); v = prev + rest.project(Point(x, y)) if rest.length > 0 else prev
                d.append(round(v)); prev = v
                used[r['stop_id']] = (round(x), round(y), stops[r['stop_id']]['stop_name'])
            pidx[key] = len(pats); pats.append({'s': si, 'd': d, 't': rel})
        L.append([pidx[key], t0])
    out[day] = sorted(L, key=lambda x: x[1])
    print(day, date, len(L), 'trips')
J = {'source': 'Bus Éireann timetable (GTFS), National Transport Authority / Transport for Ireland',
     'days': {k: datetime.datetime.strptime(v, '%Y%m%d').strftime('%A %-d %B %Y') for k, v in DAYS.items()},
     'routes': [{'id': routes[r]['route_short_name'], 'name': routes[r]['route_long_name'], 'col': COL.get(routes[r]['route_short_name'], '#fff')} for r in RIDS],
     'shapes': shapes, 'pats': pats, 'trips': out, 'stops': list(used.values())}
s = json.dumps(J, separators=(',', ':'), ensure_ascii=False); open(f'{OUT}/buses.json', 'w').write(s)
print(len(shapes), 'shapes', len(pats), 'patterns', len(used), 'stops', len(s) // 1024, 'KB')
