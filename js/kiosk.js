/* Kiosk for the A-IARG 2027 Sligo model. Visitors raise water, ask questions of the town and switch map layers;
   everything they choose is sent to the projector windows (project.html?out and ?out=2) over a BroadcastChannel. */
(async function () {
  'use strict';
  const { $, esc, fmtN, toITM, fromITM, getJSON, bus } = AW;
  const { BF, AF, fmtField, normKey, run, summary, PRESETS, C, areaColours } = Q;

  const cfg = await getJSON('exhibition/config.json').catch(() => ({ staffPin: '1234', idleSeconds: 180 }));
  const boot = m => { $('#bootMsg').textContent = m; };

  // ---------------------------------------------------------------- data
  boot('Loading buildings, census areas and water…');
  const [BJ, AJ, ZJ, RJ, CJ, WJ, FJ, MJ] = await Promise.all(['buildings', 'areas', 'zoning', 'roads', 'context', 'water', 'flood', 'model'].map(n => getJSON(`data/${n}.json`)));
  const OPW = await getJSON('data/opw_flood.json');
  OPW.features.forEach(f => FJ.features.push({ type: 'Feature', properties: { src: 'opw', level: f.properties.aep, fut: 'now', ha: f.properties.ha }, geometry: f.geometry }));
  // OPW future maps: the sea about 2100 (+0.5 to +2.0 m) at 1 in 2, 20 and 100 years; the river's mid-range and high-end futures
  (await getJSON('data/opw_future.json').catch(() => ({ features: [] }))).features.forEach(f => FJ.features.push(f));
  const OPWNAME = { 10: '1 in 10 years', 5: '1 in 20 years', 1: '1 in 100 years', 0.1: '1 in 1,000 years' };
  const FUTNAME = { now: 'today', m: 'mid-range future', h: 'high-end future' };
  const RISENAME = { 0: 'today', 0.5: 'mid-range future', 1: 'high-end future', 1.5: 'high+ future', 2: 'high++ future' };
  const D = { B: BJ.features, A: AJ.features, SA: {} };
  D.A.forEach((a, i) => { D.SA[a.properties.sa_pub2022] = a.properties; });
  const LEVELS = { opw: [10, 5, 1], opwF: [10, 1, 0.1], coast: [0, 0.5, 1, 1.5, 2], sea: [...new Set(FJ.features.filter(f => f.properties.src === 'sea').map(f => f.properties.level))].sort((a, b) => a - b),
                   lake: [...new Set(FJ.features.filter(f => f.properties.src === 'lake').map(f => f.properties.level))].sort((a, b) => a - b) };

  // ---------------------------------------------------------------- state (what the projector shows)
  const LAYERS = [
    { id: 'roads', n: 'Roads', s: 'Cut into the model', col: '#ffffff', on: true },
    { id: 'water', n: 'Water today', s: 'River, harbour, bay, lake', col: C.water, on: true },
    { id: 'areas', n: 'Census areas', s: 'Coloured by the indicator below', col: '#3fb0c4', on: false },
    { id: 'zoning', n: 'Zoning', s: 'Development plan', col: '#c88bd0', on: false },
    { id: 'mon', n: 'Recorded monuments', s: 'National Monuments Service', col: '#62d39a', on: false },
    { id: 'scheme', n: 'Proposed river crossing', s: 'Garavogue road and bridge', col: C.scheme, on: false },
    { id: 'relief', n: 'Shaded relief', s: 'Light on the hills', col: '#8a9a9c', on: false },
    { id: 'grid', n: 'Tile grid', s: 'The 52 printed tiles', col: '#f0a54a', on: false },
    { id: 'opw', n: 'OPW flood maps', s: 'River: 1 in 10, 20 and 100 years', col: '#8f86ff', on: false },
    { id: 'buses', n: 'Town buses', s: 'S1, S2 and S3, from the timetable', col: '#ff4f7b', on: false },
    { id: 'traffic', n: 'Traffic', s: 'Main roads, typical for the time of day', col: '#e53935', on: false }
  ];
  const DEF = () => ({ tab: 'water', src: 'sea', level: 3.0, flood: true, preset: -1, query: null, layers: Object.fromEntries(LAYERS.map(l => [l.id, l.on])), areaKey: 'pct_ber_e_to_g', busFast: false, rp: 100, fut: 'now', planY: 2026, planOnly: false, solo: true });
  let K = DEF(), touched = false, lastTouch = Date.now();
  let litB = new Set(), litA = new Set(), ready = false, lastL = [], lastQ = null, lastLayer = null;
  const screens = new Set();                                // story screens open (screen.html on the large monitor)
  const P = bus(m => { if (ready) onMsg(m); });
  const outs = new Set();                                   // projector windows open (0 = projector 1, 1 = projector 2)
  const nProj = () => { try { return (JSON.parse(localStorage.getItem('aiarg-projector-v2') || '{}').n) === 2 ? 2 : 1; } catch (e) { return 1; } };

  const BUS = await AW.buses();
  const UT = await AW.utilities();
  Object.values(UT).forEach(u => LAYERS.push({ id: u.id, n: u.name, s: u.sub, col: u.col, on: false }));
  const PL = await AW.planning(); if (PL) LAYERS.push({ id: 'planning', n: 'Planning permissions', s: 'Granted since 2017, year by year', col: AW.PLAN.homes[0], on: false });
  const NA = await AW.nature(); if (NA) LAYERS.push({ id: 'nature', n: 'Protected nature sites', s: 'SAC, SPA and pNHA (NPWS)', col: AW.NATURE.sac[0], on: false });
  const NH = await AW.niah(); if (NH) LAYERS.push({ id: 'niah', n: 'Architectural heritage', s: 'NIAH buildings, by rating', col: AW.NIAH.National[0], on: false });
  const PW = await AW.power(); if (PW) LAYERS.push({ id: 'power', n: 'Electricity', s: 'Lines, substations, transformers', col: AW.POWER.sub[0], on: false });
  const CY = await AW.cycling(); if (CY) LAYERS.push({ id: 'cycle', n: 'Cycle routes', s: 'Tracks, shared paths and lanes', col: AW.CYCLE.track[0], on: false });
  const TT = AW.traffic; TT.setConfigKey(cfg.tomtomKey); let ttB = -1, ttErr = '', ttRetry = 0;
  const TY = AW.typicalTraffic, RC = AW.trafficRec; let tyStep = null;
  const LV = [.3, .6, .8, 1];                                   // recorded level → the colour scale typical traffic uses
  const recDay = () => { const d = RC.bestDay(); return d && d.n === typFC.features.length ? d : null; };
  const live = () => !!TT.key() && !ttErr;                  // live TomTom when there is a working key, typical traffic otherwise

  // ---------------------------------------------------------------- map
  boot('Drawing the map…');
  const ring = MJ.circle;                                                  // GeoJSON polygon, lon/lat
  const [X0, Y0] = MJ.origin, SZ = MJ.size;
  const corners = [[X0, Y0 + SZ], [X0 + SZ, Y0 + SZ], [X0 + SZ, Y0], [X0, Y0]].map(([e, n]) => fromITM(e, n));
  const outside = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-9, 53.8], [-7.8, 53.8], [-7.8, 54.8], [-9, 54.8], [-9, 53.8]], ring.coordinates[0].slice().reverse()] } };
  const tileFC = { type: 'FeatureCollection', features: MJ.tiles.map(t => ({ type: 'Feature', properties: { ref: t.ref }, geometry: { type: 'Polygon', coordinates: [[[t.x0, t.y0], [t.x0 + 575, t.y0], [t.x0 + 575, t.y0 + 575], [t.x0, t.y0 + 575], [t.x0, t.y0]].map(([e, n]) => fromITM(e, n))] } })) };
  const [cLon, cLat] = fromITM(MJ.centre[0], MJ.centre[1]);
  const map = new maplibregl.Map({
    container: 'map', attributionControl: false, antialias: true, maxPitch: 70, dragRotate: true,
    center: [cLon, cLat], zoom: 13.15, pitch: 42, bearing: -18,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#050d10' } }] }
  });
  const homeView = () => map.flyTo({ center: [cLon, cLat], zoom: 13.15, pitch: 42, bearing: -18, duration: 1400 });
  await new Promise(r => map.on('load', r));
  map.addSource('hs', { type: 'image', url: 'data/hillshade.png', coordinates: corners });
  map.addSource('a', { type: 'geojson', data: AJ });
  map.addSource('z', { type: 'geojson', data: ZJ });
  map.addSource('w', { type: 'geojson', data: WJ });
  map.addSource('f', { type: 'geojson', data: FJ });
  map.addSource('r', { type: 'geojson', data: RJ });
  map.addSource('mon', { type: 'geojson', data: CJ.monuments });
  map.addSource('b', { type: 'geojson', data: BJ });
  map.addSource('out', { type: 'geojson', data: outside });
  map.addSource('ring', { type: 'geojson', data: { type: 'Feature', geometry: ring } });
  map.addSource('tiles', { type: 'geojson', data: tileFC });
  map.addSource('scheme', { type: 'geojson', data: { type: 'Feature', geometry: MJ.scheme } });
  map.addLayer({ id: 'hs', type: 'raster', source: 'hs', paint: { 'raster-opacity': .5, 'raster-saturation': -1, 'raster-brightness-max': .55 } });
  map.addLayer({ id: 'area-fill', type: 'fill', source: 'a', layout: { visibility: 'none' }, paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': .55 } });
  map.addLayer({ id: 'zoning', type: 'fill', source: 'z', layout: { visibility: 'none' }, paint: { 'fill-color': ['coalesce', ['get', 'colour'], '#555'], 'fill-opacity': .45 } });
  map.addLayer({ id: 'water', type: 'fill', source: 'w', paint: { 'fill-color': '#164a6b', 'fill-opacity': .95 } });
  map.addSource('opw', { type: 'geojson', data: OPW });
  map.addLayer({ id: 'opw', type: 'fill', source: 'opw', layout: { visibility: 'none' }, paint: { 'fill-color': ['match', ['get', 'aep'], 10, C.opwBands[10], 5, C.opwBands[5], C.opwBands[1]], 'fill-opacity': .6 } });
  map.addLayer({ id: 'flood', type: 'fill', source: 'f', filter: ['==', 'level', -1], paint: { 'fill-color': C.sea, 'fill-opacity': .55 } });
  map.addLayer({ id: 'flood-line', type: 'line', source: 'f', filter: ['==', 'level', -1], paint: { 'line-color': '#bfe6ff', 'line-width': 1.2 } });
  map.addLayer({ id: 'roads', type: 'line', source: 'r', paint: { 'line-color': '#7f9ba1', 'line-opacity': .7, 'line-width': ['match', ['get', 'fclass'], ['motorway', 'trunk', 'primary'], 2.2, ['secondary', 'tertiary'], 1.5, .8] } });
  map.addLayer({ id: 'scheme', type: 'fill', source: 'scheme', layout: { visibility: 'none' }, paint: { 'fill-color': C.scheme, 'fill-opacity': .85 } });
  map.addLayer({ id: 'b', type: 'fill-extrusion', source: 'b', paint: { 'fill-extrusion-color': '#2a4249', 'fill-extrusion-height': ['coalesce', ['get', 'h'], 4], 'fill-extrusion-opacity': .95 } });
  map.addLayer({ id: 'a-sel', type: 'line', source: 'a', paint: { 'line-color': C.match, 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2.4, 0] } });
  map.addLayer({ id: 'mon', type: 'circle', source: 'mon', layout: { visibility: 'none' }, paint: { 'circle-radius': 4, 'circle-color': '#0b151b', 'circle-stroke-color': '#62d39a', 'circle-stroke-width': 1.6 } });
  map.addLayer({ id: 'tiles', type: 'line', source: 'tiles', layout: { visibility: 'none' }, paint: { 'line-color': '#f0a54a', 'line-width': 1, 'line-opacity': .7 } });
  // town buses: the route lines, and a dot for each bus, moved several times a second from the timetable
  const busLines = { type: 'FeatureCollection', features: BUS.lines.map(l => ({ type: 'Feature', properties: { col: BUS.routes[l.r].col }, geometry: { type: 'LineString', coordinates: l.x.map((x, i) => fromITM(x, l.y[i])) } })) };
  map.addSource('bus-lines', { type: 'geojson', data: busLines });
  map.addSource('bus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'bus-lines', type: 'line', source: 'bus-lines', layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': 1.6, 'line-opacity': .45 } });
  map.addLayer({ id: 'bus', type: 'circle', source: 'bus', layout: { visibility: 'none' }, paint: { 'circle-radius': 5.5, 'circle-color': ['get', 'col'], 'circle-stroke-color': '#050d10', 'circle-stroke-width': 1.5 } });
  // live traffic: TomTom raster tiles over the roads, refreshed every few minutes while the layer is on
  // typical traffic: the main roads as lines, recoloured every 10 minutes of clock time
  const typFC = { type: 'FeatureCollection', features: [] };
  RJ.features.forEach(f => { if (!TY.W[f.properties.fclass]) return; const g = f.geometry, parts = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
    parts.forEach(cs => { const m = toITM(...cs[cs.length >> 1]); typFC.features.push({ type: 'Feature', properties: { fc: f.properties.fclass, d: Math.hypot(m[0] - MJ.centre[0], m[1] - MJ.centre[1]), col: '#3cb44b' }, geometry: { type: 'LineString', coordinates: cs } }); }); });
  map.addSource('typ', { type: 'geojson', data: typFC });
  map.addLayer({ id: 'typ', type: 'line', source: 'typ', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['match', ['get', 'fc'], ['trunk', 'primary', 'motorway'], 4, 3] } }, 'b');
  function typTick() {
    // Now: live TomTom if it works, else typical. A day in 3 minutes: a recorded TomTom weekday if there is one, else typical
    const on = K.layers.traffic && (!live() || K.busFast); map.setLayoutProperty('typ', 'visibility', on ? 'visible' : 'none'); if (!on) { tyStep = null; return; }
    const c = BUS.clock(K.busFast), rd = c.fast ? recDay() : null, st = TY.step(c) + (c.fast ? 'f' : '') + c.day + (rd ? rd.date : ''); if (st === tyStep) return; tyStep = st;
    const lv = rd ? RC.at(rd, c.t) : null;
    typFC.features.forEach((f, i) => { f.properties.col = TY.colour(lv && lv[i] >= 0 ? LV[lv[i]] : TY.level(f.properties.fc, f.properties.d, c)); }); map.getSource('typ').setData(typFC);
    const el = $('#typClock'), hm = BUS.hhmm(Math.floor(c.t / 600) * 600);
    if (el) el.textContent = rd ? `TomTom traffic recorded ${RC.label(rd)}, replayed: ${hm}` : `Typical traffic at ${hm}, ${c.fast ? 'weekday' : BUS.dayName[c.day]} · modelled, not live`;
  }
  function trafficTick() {
    typTick();
    const on = K.layers.traffic && live() && !K.busFast, b = TT.bucket();
    if (!on) { if (map.getLayer('traffic')) map.setLayoutProperty('traffic', 'visibility', 'none'); return; }
    if (!map.getSource('traffic')) {
      map.addSource('traffic', { type: 'raster', tiles: [TT.template(b)], tileSize: 256, minzoom: 12, maxzoom: 15, attribution: '© TomTom' });
      map.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': .95 } }, 'b'); ttB = b;
    } else if (ttB !== b) { map.getSource('traffic').setTiles([TT.template(b)]); ttB = b; }
    map.setLayoutProperty('traffic', 'visibility', 'visible');
  }
  map.on('error', e => { if (e.sourceId === 'traffic' && !ttErr) { ttErr = 'TomTom did not load'; trafficTick(); legend(); TT.test().then(r => { if (r.ok && ttRetry++ < 2) { $('#ttState').textContent = 'Live traffic restarted: ' + r.msg; ttReset(); P.send({ t: 'tt-key' }); } else $('#ttState').textContent = 'Live traffic is off: ' + r.msg; }); } });
  setInterval(trafficTick, 15000);
  // underground networks: pipes, a dash moving downstream, and the sewer outfalls
  Object.values(UT).forEach(u => {
    const fc = { type: 'FeatureCollection', features: u.lines.map(l => ({ type: 'Feature', properties: { f: l.f }, geometry: { type: 'LineString', coordinates: l.xy.map(([e, n]) => fromITM(e, n)) } })) };
    map.addSource(u.id, { type: 'geojson', data: fc });
    map.addLayer({ id: u.id, type: 'line', source: u.id, layout: { visibility: 'none', 'line-join': 'round' }, paint: { 'line-color': u.col, 'line-width': 1.6, 'line-opacity': .8 } }, 'b');
    map.addLayer({ id: u.id + '-flow', type: 'line', source: u.id, filter: ['==', ['get', 'f'], 1], layout: { visibility: 'none' }, paint: { 'line-color': u.dot, 'line-width': 2, 'line-dasharray': [0, 4, 3] } }, 'b');
    const op = u.points.outfall; if (op.length) {
      map.addSource(u.id + '-out', { type: 'geojson', data: { type: 'FeatureCollection', features: op.map(([e, n]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: fromITM(e, n) } })) } });
      map.addLayer({ id: u.id + '-out', type: 'circle', source: u.id + '-out', layout: { visibility: 'none' }, paint: { 'circle-radius': 5, 'circle-color': '#050d10', 'circle-stroke-color': u.col, 'circle-stroke-width': 2.2 } });
    }
  });
  // water supply zones (which source feeds each part of town) and reservoirs, under the water mains
  Object.values(UT).forEach(u => {
    if (!u.zones.length) return;
    map.addSource(u.id + '-zone', { type: 'geojson', data: { type: 'FeatureCollection', features: u.zones.map((z, i) => ({ type: 'Feature', properties: { i, col: AW.SUPPLY[z.src] || '#888' }, geometry: { type: 'MultiPolygon', coordinates: z.rings.map(r => [r.map(([e, n]) => fromITM(e, n))]) } })) } });
    map.addLayer({ id: u.id + '-zone', type: 'fill', source: u.id + '-zone', layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'col'], 'fill-opacity': .22 } }, u.id);
    map.addLayer({ id: u.id + '-zone-l', type: 'line', source: u.id + '-zone', layout: { visibility: 'none' }, paint: { 'line-color': ['get', 'col'], 'line-width': 1.2, 'line-opacity': .8 } }, u.id);
    if (u.tanks.length) {
      map.addSource(u.id + '-tank', { type: 'geojson', data: { type: 'FeatureCollection', features: u.tanks.map(([e, n]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: fromITM(e, n) } })) } });
      map.addLayer({ id: u.id + '-tank', type: 'circle', source: u.id + '-tank', layout: { visibility: 'none' }, paint: { 'circle-radius': 7, 'circle-color': '#050d10', 'circle-stroke-color': u.col, 'circle-stroke-width': 3 } });
    }
  });
  // treatment plants: just beyond the edge of the model, so on the kiosk map only
  Object.values(UT).forEach(u => {
    if (!u.plants.length) return;
    map.addSource(u.id + '-plant', { type: 'geojson', data: { type: 'FeatureCollection', features: u.plants.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: fromITM(...p.xy) } })) } });
    map.addLayer({ id: u.id + '-plant', type: 'circle', source: u.id + '-plant', layout: { visibility: 'none' }, paint: { 'circle-radius': 8, 'circle-color': u.col, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
  });
  if (CY) {                                                          // cycle routes by kind, and bike parking
    map.addSource('cycle', { type: 'geojson', data: { type: 'FeatureCollection', features: CY.lines.map(l => ({ type: 'Feature', properties: { col: AW.CYCLE[l.k][0], k: l.k }, geometry: { type: 'LineString', coordinates: l.xy.map(([e, n]) => fromITM(e, n)) } })) } });
    map.addLayer({ id: 'cycle', type: 'line', source: 'cycle', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['match', ['get', 'k'], 'track', 3.2, 2.4] } }, 'b');
    map.addSource('cycle-park', { type: 'geojson', data: { type: 'FeatureCollection', features: CY.parking.map(([e, n]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: fromITM(e, n) } })) } });
    map.addLayer({ id: 'cycle-park', type: 'circle', source: 'cycle-park', layout: { visibility: 'none' }, paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': AW.CYCLE.track[0], 'circle-stroke-width': 1.5 } });
  }
  if (PL) {                                                          // planning permissions: site outlines (and points for the few without one)
    const feats = PL.apps.map((a, i) => ({ type: 'Feature', id: i, properties: { i, k: a.k, col: AW.PLAN[a.k][0], y: Math.max(a.y, PL.first), g: a.dec === 'granted' ? 1 : 0 },
      geometry: a.rings ? { type: 'Polygon', coordinates: a.rings.map(r => r.map(([e, n]) => fromITM(e, n))) } : { type: 'Point', coordinates: fromITM(...a.p) } }));
    map.addSource('plan', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
    map.addLayer({ id: 'plan-fill', type: 'fill', source: 'plan', filter: ['==', 'g', -1], layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['case', ['==', ['get', 'y'], ['literal', 0]], .95, .6] } }, 'b');
    map.addLayer({ id: 'plan-line', type: 'line', source: 'plan', filter: ['==', 'g', -1], layout: { visibility: 'none' }, paint: { 'line-color': ['get', 'col'], 'line-width': 1.5 } });
    map.addLayer({ id: 'plan-pt', type: 'circle', source: 'plan', filter: ['==', 'g', -1], layout: { visibility: 'none' }, paint: { 'circle-radius': 5, 'circle-color': ['get', 'col'], 'circle-stroke-color': '#050d10', 'circle-stroke-width': 1 } });
  }
  function planShow() {
    if (!PL) return; const on = K.layers.planning, y = K.planY;
    ['plan-fill', 'plan-line', 'plan-pt'].forEach(id => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
    $('#planCtl').hidden = !on; if (!on) return;
    const yf = K.planOnly ? ['==', ['get', 'y'], y] : ['<=', ['get', 'y'], y], base = ['all', ['==', ['get', 'g'], 1], yf];
    map.setFilter('plan-fill', ['all', base, ['==', ['geometry-type'], 'Polygon']]); map.setFilter('plan-line', ['all', base, ['==', ['geometry-type'], 'Polygon']]); map.setFilter('plan-pt', ['all', base, ['==', ['geometry-type'], 'Point']]);
    map.setPaintProperty('plan-fill', 'fill-opacity', ['case', ['==', ['get', 'y'], y], .95, .45]);
    const sh = PL.shown(y, K.planOnly), yr = PL.shown(y, true), hm = a => a.reduce((t, x) => t + x.h, 0), fz = sh.filter(a => a.fz);
    $('#planOut').textContent = K.planOnly ? String(y) : (y === PL.first ? String(y) : `${PL.first}–${y}`);
    $('#planStats').innerHTML = `
      <div class="k-stat hot"><b>${fmtN(sh.length)}</b><span>permissions granted${K.planOnly ? ' in ' + y : ''}</span></div>
      <div class="k-stat"><b>${fmtN(hm(sh))}</b><span>new homes in them</span></div>
      <div class="k-stat"><b>${fmtN(yr.length)}</b><span>granted in ${y}, for ${fmtN(hm(yr))} homes</span></div>
      <div class="k-stat"><b>${fmtN(fz.length)}</b><span>in today's OPW 1-in-100-year flood zones (${fmtN(hm(fz))} homes)</span></div>`;
  }
  let planTimer = 0;
  function planPlay(on) {
    clearInterval(planTimer); planTimer = 0; $('#planPlay').textContent = on ? '❚❚ Pause' : '▶ Play';
    if (!on) return; if (K.planY >= PL.last) K.planY = PL.first - 1;
    planTimer = setInterval(() => { touch(); K.planY++; if (K.planY >= PL.last) { K.planY = PL.last; planPlay(false); } $('#planY').value = K.planY; planShow(); legend(); sendState(); }, 1300);
  }
  if (NA) {                                                          // protected sites: SAC filled, SPA dashed outline, pNHA dotted outline
    const feats = []; NA.sites.forEach((st, i) => st.rings.forEach(poly => feats.push({ type: 'Feature', properties: { i, k: st.k }, geometry: { type: 'Polygon', coordinates: poly.map(r => r.map(([e, n]) => fromITM(e, n))) } })));
    map.addSource('nature', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
    map.addLayer({ id: 'nature-sac', type: 'fill', source: 'nature', filter: ['==', 'k', 'sac'], layout: { visibility: 'none' }, paint: { 'fill-color': AW.NATURE.sac[0], 'fill-opacity': .4 } }, 'b');
    map.addLayer({ id: 'nature-sac-l', type: 'line', source: 'nature', filter: ['==', 'k', 'sac'], layout: { visibility: 'none' }, paint: { 'line-color': AW.NATURE.sac[0], 'line-width': 1.5 } });
    map.addLayer({ id: 'nature-spa', type: 'line', source: 'nature', filter: ['==', 'k', 'spa'], layout: { visibility: 'none' }, paint: { 'line-color': AW.NATURE.spa[0], 'line-width': 2.2, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'nature-nha', type: 'line', source: 'nature', filter: ['in', 'k', 'nha', 'pnha'], layout: { visibility: 'none' }, paint: { 'line-color': AW.NATURE.pnha[0], 'line-width': 1.4, 'line-dasharray': [1, 2] } });
  }
  if (NH) {                                                          // NIAH: the matched building footprints, coloured by rating; points where no footprint matched
    const feats = NH.items.map((o, i) => ({ type: 'Feature', properties: { i, col: (AW.NIAH[o.rating] || AW.NIAH.Local)[0] }, geometry: o.b != null ? BJ.features[o.b].geometry : { type: 'Point', coordinates: fromITM(o.x, o.y) } }));
    map.addSource('niah', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
    map.addLayer({ id: 'niah', type: 'fill-extrusion', source: 'niah', filter: ['!=', ['geometry-type'], 'Point'], layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': ['get', 'col'], 'fill-extrusion-height': 14, 'fill-extrusion-opacity': .95 } });
    map.addLayer({ id: 'niah-pt', type: 'circle', source: 'niah', filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' }, paint: { 'circle-radius': 5, 'circle-color': ['get', 'col'], 'circle-stroke-color': '#050d10', 'circle-stroke-width': 1 } });
  }
  if (PW) {                                                          // electricity: lines by voltage, ESB substations, points; rings where the flood zone reaches
    map.addSource('power-l', { type: 'geojson', data: { type: 'FeatureCollection', features: (PW.lines || []).map(l => ({ type: 'Feature', properties: { col: AW.VOLT[l.v][0], u: l.u, w: l.v === '38kv' || l.v === '110kv' ? 2.6 : l.v === 'mv' ? 1.8 : 1.2 }, geometry: { type: 'LineString', coordinates: l.xy.map(([e, n]) => fromITM(e, n)) } })) } });
    map.addLayer({ id: 'power-l', type: 'line', source: 'power-l', layout: { visibility: 'none', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['get', 'w'], 'line-dasharray': ['case', ['==', ['get', 'u'], 1], ['literal', [1, 1.5]], ['literal', [1, 0]]] } });
    map.addSource('power-s', { type: 'geojson', data: { type: 'FeatureCollection', features: (PW.subs || []).filter(s => s.ring).map((s, i) => ({ type: 'Feature', properties: { i: PW.subs.indexOf(s) }, geometry: { type: 'Polygon', coordinates: [s.ring.map(([e, n]) => fromITM(e, n))] } })) } });
    map.addLayer({ id: 'power-s', type: 'fill', source: 'power-s', layout: { visibility: 'none' }, paint: { 'fill-color': '#ff5d8f', 'fill-opacity': .75, 'fill-outline-color': '#ffffff' } });
    map.addSource('power', { type: 'geojson', data: { type: 'FeatureCollection', features: PW.pts.map((p, i) => ({ type: 'Feature', properties: { i, k: p.k, col: AW.POWER[p.k][0], fz: p.fz, fz1: p.fz1 }, geometry: { type: 'Point', coordinates: fromITM(p.x, p.y) } })) } });
    map.addSource('power-cov', { type: 'geojson', data: { type: 'FeatureCollection', features: PW.cov.map(r => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r.map(([e, n]) => fromITM(e, n))] } })) } });
    map.addLayer({ id: 'power-cov', type: 'line', source: 'power-cov', layout: { visibility: 'none' }, paint: { 'line-color': '#ffd60a', 'line-width': 1, 'line-dasharray': [2, 3], 'line-opacity': .5 } });
    map.addLayer({ id: 'power', type: 'circle', source: 'power', layout: { visibility: 'none' }, paint: {
      'circle-radius': ['match', ['get', 'k'], 'sub', 5.5, 'tx', 5, 'gen', 4, 'pylon', 3, 2], 'circle-color': ['get', 'col'],
      'circle-stroke-color': ['case', ['==', ['get', 'fz'], 1], '#ff3b30', ['==', ['get', 'fz1'], 1], '#7aa7ff', '#050d10'], 'circle-stroke-width': ['case', ['any', ['==', ['get', 'fz'], 1], ['==', ['get', 'fz1'], 1]], 2.5, .8] } });
  }
  const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
  let dashI = 0;
  setInterval(() => { dashI = (dashI + 1) % DASH.length; Object.values(UT).forEach(u => { if (K.layers[u.id]) map.setPaintProperty(u.id + '-flow', 'line-dasharray', DASH[dashI]); }); }, 90);
  map.addLayer({ id: 'out', type: 'fill', source: 'out', paint: { 'fill-color': '#050d10', 'fill-opacity': .9 } });
  map.addLayer({ id: 'ring', type: 'line', source: 'ring', paint: { 'line-color': '#f0a54a', 'line-width': 1.6, 'line-dasharray': [3, 2] } });

  // ---------------------------------------------------------------- live OPW water levels (if the browser can reach them)
  (async () => {
    try {
      const r = await fetch('https://waterlevel.ie/geojson/latest/', { cache: 'no-store' }); if (!r.ok) return;
      const gj = await r.json(), near = {};
      gj.features.forEach(f => {
        const p = f.properties || {}, g = f.geometry?.coordinates; if (!g || String(p.sensor_ref).toUpperCase() !== 'OD') return;
        const [E, N] = toITM(g[0], g[1]); if (Math.hypot(E - MJ.centre[0], N - MJ.centre[1]) > 6000) return;
        near[p.station_ref || p.station_name] = { name: p.station_name, v: +p.value, t: p.datetime };
      });
      const g = Object.values(near); if (!g.length) return;
      $('#gauge').innerHTML = 'OPW LIVE · ' + g.slice(0, 3).map(x => `${esc(x.name)} <b>${fmtN(x.v, 2)} m OD</b>`).join(' · ');
      $('#gauge').hidden = false;
    } catch (e) { /* the feed may not allow browser access: the panel stays hidden */ }
  })();

  // ---------------------------------------------------------------- what's lit: buildings, areas, flood
  function setLit(tgt, ids) {
    map.removeFeatureState({ source: 'a' });
    litB = new Set(tgt === 'b' ? ids : []); litA = new Set(tgt === 'a' ? ids : []);
    litA.forEach(i => map.setFeatureState({ source: 'a', id: i }, { sel: true }));
    const arr = [...litB];
    map.setPaintProperty('b', 'fill-extrusion-color', arr.length ? ['case', ['in', ['id'], ['literal', arr]], C.match, '#24363c'] : '#2a4249');
  }
  function showFlood() {
    const on = K.flood, f = ['all', ['==', ['get', 'src'], K.src], ['==', ['get', 'level'], K.level]];
    if (K.src === 'coast') f.push(['==', ['get', 'rp'], K.rp]);
    if (K.src === 'opw') f.push(['==', ['coalesce', ['get', 'fut'], 'now'], K.fut]);
    map.setFilter('flood', on ? f : ['==', 'level', -1]); map.setFilter('flood-line', on ? f : ['==', 'level', -1]);
    map.setPaintProperty('flood', 'fill-color', srcCol());
  }
  const srcCol = () => K.src === 'sea' ? C.sea : K.src === 'lake' ? C.lake : K.src === 'coast' ? C.coast : C.opw;
  const levels = () => K.src === 'opw' && K.fut !== 'now' ? LEVELS.opwF : LEVELS[K.src];
  const isMine = p => p.src === K.src && p.level === K.level && (K.src !== 'coast' || p.rp === K.rp) && (K.src !== 'opw' || (p.fut || 'now') === K.fut);
  const floodName = () => K.src === 'opw' ? `OPW river flood map, ${FUTNAME[K.fut]}: ${OPWNAME[K.level]}` : K.src === 'coast' ? (K.level ? `OPW sea, ${RISENAME[K.level]} (+${fmtN(K.level, 1)} m): a 1-in-${K.rp}-year flood` : `OPW sea today: a 1-in-${K.rp}-year flood`) : `${K.src === 'sea' ? 'Sea' : 'Lough Gill'} at ${fmtN(K.level, 1)} m OD`;
  function showLayers() {
    const vis = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('roads', K.layers.roads); vis('water', K.layers.water); vis('zoning', K.layers.zoning); vis('mon', K.layers.mon);
    vis('scheme', K.layers.scheme); vis('opw', K.layers.opw); vis('tiles', K.layers.grid); vis('hs', true); map.setPaintProperty('hs', 'raster-opacity', K.layers.relief ? .8 : .45);
    vis('area-fill', K.layers.areas); trafficTick(); Object.values(UT).forEach(u => { vis(u.id, K.layers[u.id]); vis(u.id + '-flow', K.layers[u.id]); if (map.getLayer(u.id + '-out')) vis(u.id + '-out', K.layers[u.id]); if (map.getLayer(u.id + '-plant')) vis(u.id + '-plant', K.layers[u.id]); ['-zone', '-zone-l', '-tank'].forEach(x => { if (map.getLayer(u.id + x)) vis(u.id + x, K.layers[u.id]); }); }); if (CY) { vis('cycle', K.layers.cycle); vis('cycle-park', K.layers.cycle); } planShow(); if (PW) ['power', 'power-cov', 'power-l', 'power-s'].forEach(id => vis(id, K.layers.power)); if (NH) ['niah', 'niah-pt'].forEach(id => vis(id, K.layers.niah)); if (NA) ['nature-sac', 'nature-sac-l', 'nature-spa', 'nature-nha'].forEach(id => vis(id, K.layers.nature)); vis('bus', K.layers.buses); vis('bus-lines', K.layers.buses); $('#busCtl').hidden = !K.layers.buses && !K.layers.traffic; busTick();
    if (K.layers.areas) { const cm = areaColours(D.A, K.areaKey), pairs = []; D.A.forEach(a => { const c = cm.get(a.properties[K.areaKey]); if (c) pairs.push(a.properties.sa_pub2022, c); });
      map.setPaintProperty('area-fill', 'fill-color', pairs.length ? ['match', ['get', 'sa_pub2022'], ...pairs, 'rgba(0,0,0,0)'] : 'rgba(0,0,0,0)'); }
    legend();
  }
  function legend() {
    const L = [];
    if (K.flood) L.push([srcCol(), floodName()]);
    if (K.layers.opw) [10, 5, 1].forEach(a => L.push([C.opwBands[a], 'OPW flood map, ' + OPWNAME[a]]));
    if (litB.size) L.push([C.match, K.flood && !K.query ? (K.src === 'opw' || K.src === 'coast' ? 'Buildings in the flood zone' : 'Buildings the water reaches') : 'Answer to your question']);
    if (litA.size) L.push([C.match, 'Census areas that match']);
    if (K.layers.areas) areaColours(D.A, K.areaKey).legend.forEach(x => L.push(x));
    if (K.layers.scheme) L.push([C.scheme, 'Proposed Garavogue crossing']);
    if (K.layers.traffic) { (live() && !K.busFast ? TT.legend : TY.legend).forEach(x => L.push(x)); if (TT.key() && ttErr) L.push(['#555', 'Live TomTom data did not load (see staff panel)']); }
    Object.values(UT).forEach(u => { if (K.layers[u.id]) { L.push([u.col, u.id === 'sewer' ? 'Sewer pipes (dashes flow downstream)' : u.name]); if (u.points.outfall.length) L.push([u.col, 'Sewer outfalls']); if (u.zones.length) { const by = {}; u.zones.forEach(z => { by[z.srcName] = by[z.srcName] || [AW.SUPPLY[z.src], 0]; by[z.srcName][1]++; }); Object.entries(by).forEach(([n, [c, k]]) => L.push([c, `Supplied from ${n}: ${k} zone${k === 1 ? '' : 's'}`])); } if (u.tanks.length) L.push([u.col, `○ Reservoirs: ${u.tanks.length}`]); u.plants.forEach(p => L.push([u.col, `● ${p.name}${p.pe ? ` (built for ${fmtN(p.pe)} people)` : ''}, just outside the model`])); } });
    if (K.layers.cycle && CY) { Object.entries(AW.CYCLE).forEach(([k, [c, n]]) => { if (CY.km[k]) L.push([c, `${n}: ${fmtN(CY.km[k], 1)} km`]); }); L.push(['#ffffff', `Bike parking: ${CY.parking.length} places`]); }
    if (K.layers.niah && NH) { const c = r => NH.items.filter(o => o.rating === r).length; ['National', 'Regional', 'Local'].forEach(r => { if (c(r)) L.push([AW.NIAH[r][0], `NIAH, ${r.toLowerCase()} importance: ${c(r)}`]); }); L.push(['#7aa7ff', `In today's 1-in-100-year flood zones: ${NH.items.filter(o => o.fz).length}; with the sea 1 m higher: ${NH.items.filter(o => o.fz1).length}`]); }
    if (K.layers.power && PW) {
      const n = k => PW.pts.filter(p => p.k === k).length, vs = new Set((PW.lines || []).map(l => l.v));
      (PW.subs || []).filter(s => /38/.test(s.v)).length && L.push(['#ff5d8f', `ESB 38 kV substations: ${(PW.subs || []).filter(s => /38/.test(s.v)).length} (none in a flood zone)`]);
      Object.entries(AW.VOLT).forEach(([k, [c, t]]) => { if (vs.has(k)) L.push([c, t]); });
      Object.entries(AW.POWER).forEach(([k, [c, t]]) => { if (n(k)) L.push([c, `${t}: ${n(k)}`]); });
      const s0 = PW.pts.filter(p => (p.k === 'sub' || p.k === 'tx') && p.fz).length, s1 = PW.pts.filter(p => (p.k === 'sub' || p.k === 'tx') && p.fz1).length;
      L.push(['#ff3b30', `Red ring: in today's 1-in-100-year flood zone (${s0} substations and transformers)`]); L.push(['#7aa7ff', `Blue ring: reached with the sea 1 m higher (${s1} in all)`]);
    }
    if (K.layers.nature && NA) NA.sites.forEach(st => L.push([AW.NATURE[st.k][0], `${AW.NATURE[st.k][1]}: ${st.name}, ${fmtN(st.hain)} ha in the circle`]));
    if (K.layers.planning && PL) Object.entries(AW.PLAN).forEach(([k, [c, n]]) => L.push([c, n]));
    if (K.layers.buses) BUS.routes.forEach(r => L.push([r.col, `Bus ${r.id}: ${r.name.replace(/ - /g, ' – ')}`]));
    lastL = L;
    $('#legend').innerHTML = L.map(([c, t]) => `<div><i style="background:${c}"></i>${esc(t)}</div>`).join('') + (K.layers.buses ? '<div class="k-busclock" id="busClock"></div>' : '') + (K.layers.traffic ? (live() && !K.busFast ? '<div class="k-busclock">Traffic © TomTom, live, updated every 5 minutes</div>' : '<div class="k-busclock" id="typClock"></div>') : '');
    tyStep = null;
    busTick();
  }

  // ---------------------------------------------------------------- 01 water arrives
  function waterReached(level = K.level) {
    if (K.src === 'opw') return run(D, { target: 'b', conditions: [{ field: { now: 'op', m: 'om', h: 'oh' }[K.fut], op: '>=', value: level }] });
    if (K.src === 'coast') return run(D, { target: 'b', conditions: [{ field: 'cf' + K.rp, op: '<=', value: level }] });
    const key = K.src === 'sea' ? 'fs' : 'fl';
    return run(D, { target: 'b', conditions: [{ field: key, op: '<=', value: level }] });
  }
  function setLevelUI() {
    const lv = levels(); if (!lv.includes(K.level)) K.level = lv[0]; const i = Math.max(0, lv.indexOf(K.level)), O = K.src === 'opw', CO = K.src === 'coast';
    $('#lv').max = lv.length - 1; $('#lv').value = i;
    $('#lvTicks').innerHTML = lv.map(v => `<span>${O ? OPWNAME[v] : CO ? (v ? '+' + fmtN(v, 1) + ' m' : 'Today') : fmtN(v, 1)}</span>`).join('');
    $('#lvOut').textContent = O ? OPWNAME[K.level] : CO ? (K.level ? `+${fmtN(K.level, 1)} m` : 'Today') : fmtN(K.level, 1) + ' m OD';
    $('#pWater .k-levelhead span').textContent = O ? 'A flood this likely' : CO ? 'Sea level: today, or the rise by about 2100' : 'Water level';
    [['#srcSea', 'sea'], ['#srcLake', 'lake'], ['#srcOpw', 'opw'], ['#srcCoast', 'coast']].forEach(([id, v]) => $(id).setAttribute('aria-pressed', K.src === v));
    $('#pWater').classList.toggle('k-opw', O); $('#pWater').classList.toggle('k-lake', K.src === 'lake'); $('#pWater').classList.toggle('k-coast', CO);
    $('#rpSeg').hidden = !CO; $('#futSeg').hidden = !O;
    $('#rpSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === K.rp));
    $('#futSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === K.fut));
  }
  function floodText() {
    return K.src === 'coast' ? `The OPW's national coastal flood maps (2021)${K.level ? ` for about 2100, with the sea ${fmtN(K.level, 1)} m higher than today (its ${RISENAME[K.level]})` : ', with today\'s sea'}, showing a storm tide with a 1-in-${K.rp} chance each year.${K.rp === 2 ? ' 1 in 2 years is not an ordinary tide: it is a high tide with a storm surge, likely to happen about every other year.' : ''}` : K.src === 'opw' ? (K.fut === 'now' ? 'OPW flood maps for the Garavogue (floodinfo.ie): the land with a 10%, 5% or 1% chance of river flooding in any one year. They model the river, not the sea.' : `OPW river flood maps for the ${FUTNAME[K.fut]} (${K.fut === 'm' ? 'about 20%' : 'about 30%'} more water in the river), at 1 in 10, 100 or 1,000 years.`) : K.src === 'sea' ? 'Sligo harbour is usually between about −1 and +2 m OD; the highest tides and surges have reached about 3 m.' : 'Lough Gill usually sits at about 3.8 m OD (lidar, 2011).';
  }
  function water(on = true) {
    K.flood = on; K.query = null; K.preset = -1;
    setLevelUI(); showFlood();
    const r = waterReached(), s = summary(D, r), f = FJ.features.find(x => isMine(x.properties));
    setLit('b', on ? r.ids : []);
    const today = floodText();
    $('#wStats').innerHTML = on ? `
      <div class="k-stat hot"><b>${fmtN(s.count)}</b><span>buildings ${K.src === 'opw' || K.src === 'coast' ? 'in the flood zone' : 'reached'}</span></div>
      <div class="k-stat"><b>${fmtN(s.homes)}</b><span>homes in them</span></div>
      <div class="k-stat"><b>${fmtN(f?.properties.ha)} ha</b><span>${K.src === 'opw' || K.src === 'coast' ? 'in the flood zone inside the circle, including the river and bay' : 'under water inside the circle, including the river and bay'}</span></div>
      <div class="k-stat"><b>${fmtN(s.commercial)}</b><span>commercial units</span></div>` : '';
    $('#wNote').textContent = on ? today + (K.src === 'opw' || K.src === 'coast' ? ' Indicative only; see floodinfo.ie for the official maps and their conditions of use.' : ' This spreads water over the ground: it ignores tides, defences and drainage, so treat it as an illustration, not a flood map.') : '';
    showLayers(); sendState();
  }
  $('#srcSea').onclick = () => { touch(); K.src = 'sea'; K.level = 3.0; water(); };
  $('#srcLake').onclick = () => { touch(); K.src = 'lake'; K.level = 6.0; water(); };
  $('#srcOpw').onclick = () => { touch(); K.src = 'opw'; K.fut = 'now'; K.level = 10; water(); };
  $('#srcCoast').onclick = () => { touch(); K.src = 'coast'; K.level = 1; K.rp = 100; water(); };
  $('#rpSeg').querySelectorAll('button').forEach(b => b.onclick = () => { touch(); K.rp = +b.dataset.v; water(); });
  $('#futSeg').querySelectorAll('button').forEach(b => b.onclick = () => { touch(); K.fut = b.dataset.v; K.level = 10; water(); });
  $('#lv').oninput = e => { touch(); K.level = levels()[+e.target.value]; water(); };
  $('#wOff').onclick = () => { touch(); water(false); };

  // ---------------------------------------------------------------- 02 ask the town
  function showResult(r, label) {
    const s = summary(D, r), el = $('#result'); lastQ = { r, label };
    if (r.tgt === 'b') {
      const z = {}; r.ids.forEach(i => { const p = r.rows[i]; const k = D.SA[p.sa]?.ed_english || 'outside the census areas'; z[k] = (z[k] || 0) + 1; });
      const top = Object.entries(z).sort((a, b) => b[1] - a[1]).slice(0, 3);
      el.innerHTML = `<div><span class="big">${fmtN(s.count)}</span>buildings · ${esc(label)}</div>
        <div class="k-dim">${fmtN(s.homes)} homes · ${fmtN(s.vacantHomes)} vacant homes · ${fmtN(s.vacantCommercial)} vacant commercial units</div>
        ${top.length ? `<ul>${top.map(([k, n]) => `<li>${esc(k)}: ${fmtN(n)}</li>`).join('')}</ul>` : ''}`;
    } else {
      el.innerHTML = `<div><span class="big">${fmtN(s.count)}</span>census small areas · ${esc(label)}</div><div class="k-dim">${fmtN(s.population)} people · ${fmtN(s.households)} households</div>`;
    }
  }
  function ask(i) {
    const p = PRESETS[i]; K.preset = i;
    const r = run(D, p.q);
    K.query = { tgt: r.tgt, label: p.n };
    if (p.flood) { K.src = p.flood.src; K.level = p.flood.level; K.rp = p.flood.rp || 100; K.fut = p.flood.fut || 'now'; K.flood = true; setLevelUI(); } else K.flood = false;
    showFlood(); setLit(r.tgt, r.ids); showResult(r, p.n);
    document.querySelectorAll('.k-preset').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i));
    showLayers(); sendState();
  }
  PRESETS.forEach((p, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'k-preset'; b.dataset.i = i; b.setAttribute('aria-pressed', 'false');
    b.innerHTML = esc(p.n) + (p.s ? `<small>${esc(p.s)}</small>` : '');
    b.onclick = () => { touch(); ask(i); };
    $(p.g === 'water' ? '#presetsWater' : '#presetsTown').append(b);
  });
  // build your own
  let tgt = 'b';
  function fieldOpts() { const o = []; if (tgt === 'b') Object.entries(BF).forEach(([k, f]) => o.push([k, 'Building · ' + f.l])); Object.entries(AF).forEach(([k, f]) => o.push(['a.' + k, (tgt === 'b' ? 'Area · ' : '') + f.l])); return o; }
  function addCond(key, op, val) {
    const row = document.createElement('div'); row.className = 'k-cond';
    const fs = document.createElement('select'); fs.setAttribute('aria-label', 'Field'); fieldOpts().forEach(([k, l]) => fs.add(new Option(l, k)));
    const os = document.createElement('select'); os.setAttribute('aria-label', 'Test'); ['>', '>=', '<', '<=', '=', '!='].forEach(x => os.add(new Option(x, x)));
    const vi = document.createElement('input'); vi.setAttribute('aria-label', 'Value'); vi.inputMode = 'decimal';
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove'); x.onclick = () => row.remove();
    fs.value = key || (tgt === 'b' ? 'fs' : 'a.pct_ber_e_to_g'); os.value = op || '<='; vi.value = val ?? (tgt === 'b' ? 3 : 50);
    row.append(fs, os, vi, x); $('#conds').append(row);
  }
  const setTgt = t => { tgt = t; $('#tgtB').setAttribute('aria-pressed', t === 'b'); $('#tgtA').setAttribute('aria-pressed', t === 'a'); $('#conds').innerHTML = ''; addCond(); };
  $('#tgtB').onclick = () => { touch(); setTgt('b'); }; $('#tgtA').onclick = () => { touch(); setTgt('a'); };
  $('#addCond').onclick = () => { touch(); addCond(); };
  $('#runQ').onclick = () => {
    touch();
    const q = { target: tgt, conditions: [...document.querySelectorAll('.k-cond')].map(r => { const [f, o, v] = r.querySelectorAll('select,input'); return { field: f.value, op: o.value, value: v.value }; }) };
    const r = run(D, q); K.preset = -1; K.query = { tgt: r.tgt, label: 'your question' }; K.flood = false; showFlood(); setLit(r.tgt, r.ids); showResult(r, 'your question');
    document.querySelectorAll('.k-preset').forEach(b => b.setAttribute('aria-pressed', 'false')); showLayers(); sendState();
  };
  $('#clearQ').onclick = () => { touch(); K.query = null; K.preset = -1; setLit('b', []); $('#result').innerHTML = '<span class="k-dim">Pick a question. The answer lights up on the model.</span>'; document.querySelectorAll('.k-preset').forEach(b => b.setAttribute('aria-pressed', 'false')); showLayers(); sendState(); };
  setTgt('b');

  // ---------------------------------------------------------------- 03 layers
  // grouped, and by default one layer at a time over the roads and water, so the white model never turns to noise
  const GROUPS = [['Water and drainage', ['water', 'opw', 'sewer', 'watermains']], ['Getting around', ['roads', 'buses', 'traffic', 'cycle']],
    ['Town and growth', ['areas', 'zoning', 'planning', 'scheme']], ['Energy', ['power']], ['Heritage and nature', ['niah', 'mon', 'nature']], ['The model', ['relief', 'grid']]];
  const BASE = new Set(['roads', 'water']);
  const placed = new Set(GROUPS.flatMap(g => g[1]));
  const extra = LAYERS.filter(l => !placed.has(l.id)).map(l => l.id); if (extra.length) GROUPS.push(['More', extra]);
  const solo = () => K.solo !== false;
  GROUPS.forEach(([title, ids]) => {
    const ls = ids.map(id => LAYERS.find(l => l.id === id)).filter(Boolean); if (!ls.length) return;
    const h = document.createElement('div'); h.className = 'k-lgroup'; h.textContent = title; $('#layerTiles').append(h);
    ls.forEach(l => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'k-tile'; b.dataset.id = l.id;
      b.innerHTML = `<i style="background:${l.col}"></i><span><b>${esc(l.n)}</b><small>${esc(l.s)}</small></span>`;
      b.onclick = () => {
        touch(); const on = !K.layers[l.id];
        if (on && solo() && !BASE.has(l.id)) Object.keys(K.layers).forEach(k => { if (!BASE.has(k)) K.layers[k] = false; });
        K.layers[l.id] = on; if (on) lastLayer = l.id; syncTiles(); showLayers(); sendState();
      };
      $('#layerTiles').append(b);
    });
  });
  $('#soloSeg').querySelectorAll('button').forEach(b => b.onclick = () => { touch(); K.solo = b.dataset.v === '1'; $('#soloSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  const syncTiles = () => { document.querySelectorAll('.k-tile').forEach(b => b.setAttribute('aria-pressed', !!K.layers[b.dataset.id])); $('#busReal').setAttribute('aria-pressed', String(!K.busFast)); $('#busFast').setAttribute('aria-pressed', String(!!K.busFast)); };
  $('#busReal').onclick = () => { touch(); K.busFast = false; syncTiles(); showLayers(); sendState(); };
  $('#busFast').onclick = () => { touch(); K.busFast = true; syncTiles(); showLayers(); sendState(); };
  if (PL) {
    $('#planY').min = PL.first; $('#planY').max = PL.last; $('#planY').value = K.planY = PL.last;
    $('#planTicks').innerHTML = Array.from({ length: PL.last - PL.first + 1 }, (_, i) => `<span>${String(PL.first + i).slice(2)}</span>`).join('');
    $('#planY').oninput = e => { touch(); planPlay(false); K.planY = +e.target.value; planShow(); sendState(); };
    $('#planPlay').onclick = () => { touch(); planPlay(!planTimer); };
    $('#planMode').querySelectorAll('button').forEach(b => b.onclick = () => { touch(); K.planOnly = b.dataset.v === 'only'; $('#planMode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); planShow(); sendState(); });
  }
  function busTick() {
    if (K.layers.traffic) typTick();
    if (!K.layers.buses) return;
    const c = BUS.clock(K.busFast), at = BUS.at(c), cl = $('#busClock');
    map.getSource('bus').setData({ type: 'FeatureCollection', features: at.map(b => ({ type: 'Feature', properties: { col: BUS.routes[b.r].col }, geometry: { type: 'Point', coordinates: fromITM(b.E, b.N) } })) });
    if (cl) cl.textContent = `${BUS.hhmm(c.t)} · ${at.length} bus${at.length === 1 ? '' : 'es'} running · ${c.fast ? 'a weekday in 3 minutes' : BUS.dayName[c.day] + ' timetable'}`;
  }
  setInterval(busTick, 125);
  Object.entries(AF).filter(([, f]) => f.t === 'num').forEach(([k, f]) => $('#areaKey').add(new Option(f.l + (f.unit ? ' (' + f.unit + ')' : ''), k)));
  $('#areaKey').onchange = e => { touch(); K.areaKey = e.target.value; K.layers.areas = true; syncTiles(); showLayers(); sendState(); };

  // ---------------------------------------------------------------- tabs
  function tab(t) {
    K.tab = t;
    document.querySelectorAll('.k-tab').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === t));
    ['water', 'ask', 'layers', 'about'].forEach(x => { $('#p' + x[0].toUpperCase() + x.slice(1)).hidden = x !== t; });
  }
  document.querySelectorAll('.k-tab').forEach(b => b.onclick = () => { touch(); tab(b.dataset.tab); if (b.dataset.tab === 'water' && !K.flood) water(true); });

  // ---------------------------------------------------------------- inspector
  const kv = rows => '<dl>' + rows.filter(r => r[1] != null && r[1] !== '—').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('') + '</dl>';
  function inspectB(i) {
    const p = D.B[i].properties, s = D.SA[p.sa];
    $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>${esc(p.fn || (p.u ? p.u[0].toUpperCase() + p.u.slice(1) : 'Building'))}</h3>
      <span class="k-dim">${esc(s?.ed_english || '')}${p.z ? ' · zone ' + esc(p.z) : ''}</span>
      ${kv([['Height', fmtField('h', p.h) + (p.h_est ? ' (est.)' : '')], ['Ground level', fmtField('gr', p.gr)], ['Sea reaches it at', p.fs != null ? fmtField('fs', p.fs) : 'not within 6 m'],
        ['Lough Gill reaches it at', p.fl != null && p.fl <= 12 ? fmtField('fl', p.fl) : 'not within 8 m'], ['Distance to water', fmtField('dw', p.dw)], ['Homes', fmtN(p.nr || 0)], ['Commercial units', fmtN(p.nc || 0)],
        ['Vacant homes', p.nvr ? fmtN(p.nvr) : null], ['Vacant commercial', p.nvc ? fmtN(p.nvc) : null]])}`;
    $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; };
  }
  function inspectP(i) {
    const a = PL.apps[i], [c, n] = AW.PLAN[a.k];
    $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>Planning ${esc(a.app)}</h3>
      <span class="k-dim"><i style="display:inline-block;width:10px;height:10px;background:${c};border-radius:2px"></i> ${esc(n)} · ${esc(a.type)} · decided ${a.y}${a.h ? ' · ' + fmtN(a.h) + ' home' + (a.h === 1 ? '' : 's') : ''}</span>
      <p class="k-small" style="margin:8px 0">${esc(a.d)}${a.d.length >= 220 ? '…' : ''}</p>
      ${a.pz != null && a.pz <= 50 ? `<p class="k-small" style="color:#8fe6b0">${a.pz === 0 ? 'Inside' : 'Within ' + a.pz + ' m of'} a European protected site (SAC or SPA).</p>` : ''}
      ${a.fz ? '<p class="k-small" style="color:#9ec9ff">Inside today\'s OPW 1-in-100-year flood zone.</p>' : a.fz1 ? '<p class="k-small" style="color:#9ec9ff">Inside the OPW 1-in-100-year sea flood zone with the sea 1 m higher (about 2100).</p>' : ''}
      <p class="k-small k-dim">Sligo County Council ePlanning record ${esc(a.app)}. Planning permission is not the same as a building started.</p>`;
    $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; };
  }
  function inspectN(ids) {
    $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>Protected nature site</h3>` + ids.map(i => { const st = NA.sites[i];
      return `<p style="margin:8px 0 2px"><i style="display:inline-block;width:10px;height:10px;background:${AW.NATURE[st.k][0]};border-radius:2px"></i> <b>${esc(st.name)}</b></p><span class="k-small k-dim">${esc(NA.kinds[st.k])} · site ${esc(st.code)} · ${fmtN(st.ha)} ha in all, ${fmtN(st.hain)} ha inside the model</span>`; }).join('') +
      `<p class="k-small k-dim" style="margin-top:8px">Boundaries from the National Parks and Wildlife Service. Development near an SAC or SPA must be screened for Appropriate Assessment.</p>`;
    $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; };
  }
  function inspectA(i) {
    const p = D.A[i].properties;
    $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>Census area ${esc(p.sa_pub2022)}</h3><span class="k-dim">${esc(p.ed_english || '')} · ${esc(p.dep_label || '')}</span>
      ${kv(['pop_total', 'households', 'pct_age_65_plus', 'pct_hh_no_car', 'pct_dwellings_vacant', 'pct_ber_e_to_g', 'pct_heat_oil', 'unemployment_rate'].map(k => [AF[k].l, fmtField('a.' + k, p[k])]))}`;
    $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; };
  }
  map.on('click', e => {
    touch();
    if (PL && K.layers.planning) { const q = map.queryRenderedFeatures(e.point, { layers: ['plan-fill', 'plan-pt'] })[0]; if (q) return inspectP(q.properties.i); }
    for (const u of Object.values(UT)) if (u.zones.length && K.layers[u.id]) { const q = map.queryRenderedFeatures(e.point, { layers: [u.id + '-zone'] })[0]; if (q) { const z = u.zones[q.properties.i]; $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>Water supply zone</h3><p style="margin:6px 0"><i style="display:inline-block;width:10px;height:10px;background:${AW.SUPPLY[z.src] || '#888'};border-radius:2px"></i> <b>${esc(z.name)}</b></p><span class="k-small k-dim">Supplied from ${esc(z.srcName)}. From the 2008 Sligo &amp; Environs water network model.</span>`; $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; }; return; } }
    if (NH && K.layers.niah) {
      const q = map.queryRenderedFeatures(e.point, { layers: ['niah', 'niah-pt'] })[0];
      if (q) { const o = NH.items[q.properties.i], dt = o.from ? (o.to && o.to !== o.from ? `${o.from}–${o.to}` : o.from) : '';
        $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>${esc(o.name)}</h3>
          <span class="k-dim"><i style="display:inline-block;width:10px;height:10px;background:${(AW.NIAH[o.rating] || AW.NIAH.Local)[0]};border-radius:2px"></i> ${esc(o.rating || '')} importance${dt ? ' · ' + esc(dt) : ''}${o.orig ? ' · built as ' + esc(o.orig) : ''}${o.use && o.use !== o.orig ? ', now ' + esc(o.use) : ''}</span>
          ${o.addr ? `<p class="k-small k-dim" style="margin:4px 0 0">${esc(o.addr)}</p>` : ''}<p class="k-small" style="margin:8px 0">${esc(o.desc)}${o.desc.length >= 240 ? '…' : ''}</p>
          ${o.fz ? '<p class="k-small" style="color:#9ec9ff">Inside today\'s OPW 1-in-100-year flood zone.</p>' : o.fz1 ? '<p class="k-small" style="color:#9ec9ff">Reached by a 1-in-100-year sea flood with the sea 1 m higher (about 2100).</p>' : ''}
          ${o.pz != null && o.pz <= 50 ? `<p class="k-small" style="color:#8fe6b0">${o.pz === 0 ? 'Inside' : 'Within ' + o.pz + ' m of'} a European protected site (SAC or SPA).</p>` : ''}
          <p class="k-small k-dim">NIAH ${esc(o.reg)}, National Inventory of Architectural Heritage (buildingsofireland.ie).</p>`;
        $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; }; return; }
    }
    if (PW && K.layers.power) {
      const qs = map.queryRenderedFeatures(e.point, { layers: ['power-s'] })[0];
      if (qs) { const st = PW.subs[qs.properties.i]; $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>${esc(st.name)}</h3><span class="k-dim">ESB Networks · ${esc(st.v || 'voltage not recorded')}</span><p class="k-small" style="margin-top:8px">${st.fz ? 'Inside today\'s OPW 1-in-100-year flood zone.' : st.fz1 ? 'Reached by a 1-in-100-year sea flood with the sea 1 m higher.' : 'Outside the OPW flood zones, today and with the sea 1 m higher.'}</p><p class="k-small k-dim">From OpenStreetMap.</p>`; $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; }; return; }
      const q = map.queryRenderedFeatures(e.point, { layers: ['power'] })[0];
      if (q) { const p = PW.pts[q.properties.i]; $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>${esc(PW.kinds[p.k])}</h3>${p.fz ? '<p class="k-small" style="color:#ff8a80">Inside today\'s OPW 1-in-100-year flood zone.</p>' : p.fz1 ? '<p class="k-small" style="color:#9ec9ff">Reached by a 1-in-100-year sea flood with the sea 1 m higher (about 2100).</p>' : (p.k === 'sub' || p.k === 'tx' || p.k === 'gen') ? '<p class="k-small k-dim">Outside the mapped flood zones.</p>' : ''}<p class="k-small k-dim">From OpenStreetMap and Tailte Éireann 1:1000 mapping.</p>`; $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; }; return; }
    }
    if (NA && K.layers.nature) { const q = map.queryRenderedFeatures(e.point, { layers: ['nature-sac', 'nature-spa', 'nature-nha'] }); if (q.length) return inspectN([...new Set(q.map(x => x.properties.i))]); }
    const f = map.queryRenderedFeatures(e.point, { layers: ['b'] })[0]; if (f) return inspectB(f.id);
    const a = map.queryRenderedFeatures(e.point, { layers: ['area-fill', 'a-sel'] })[0]; if (a) return inspectA(a.id);
    $('#insp').hidden = true;
  });

  // ---------------------------------------------------------------- the projector
  function sendState() {
    touched = true; screenSoon();
    P.send({ t: 'kiosk', s: { flood: K.flood ? { src: K.src, level: K.level, rp: K.rp, fut: K.fut } : null, sel: { tgt: litA.size ? 'a' : 'b', ids: litA.size ? [...litA] : [...litB] }, layers: K.layers, areaKey: K.areaKey, busFast: K.busFast, planY: K.planY, planOnly: K.planOnly } });
  }
  function onMsg(m) {
    if (m.t === 'hello' && m.who === 'out') { outs.add(m.i || 0); link(); sendState(); }
    if (m.t === 'bye' && m.who === 'out') { outs.delete(m.i || 0); link(); }
    if (m.t === 'want-kiosk') sendState();
    if (m.t === 'hello' && m.who === 'screen') { const n = screens.size; screens.add(m.id); if (screens.size !== n) link(); screenSend(true); }
    if (m.t === 'bye' && m.who === 'screen') { screens.delete(m.id); link(); }
  }
  function link() {
    const n = nProj(), have = [...outs].filter(i => i < n).length, el = $('#projLink');
    el.textContent = n === 1 ? (have ? 'Projector: connected' : 'Projector: not connected') : `Projectors: ${have} of 2 connected`; el.dataset.on = have === n ? '1' : '0';
    const sc = $('#screenLink'); if (sc) { sc.textContent = screens.size ? 'Story screen: connected' : 'Story screen: not open'; sc.dataset.on = screens.size ? '1' : '0'; }
    $('#staffStatus').textContent = (screens.size ? 'The story screen is open. ' : 'The story screen is not open. ') + (have === n ? (n === 1 ? 'The projector window is open and following the kiosk.' : 'Both projector windows are open and following the kiosk.')
      : n === 1 ? 'No projector window is open in this browser. Open it, drag it to the projector and press F.'
      : `${have} of 2 projector windows are open. Open them, drag each to its projector and press F in each.`);
  }
  P.send({ t: 'ping' }); P.send({ t: 'screen-ping' });

  // ---------------------------------------------------------------- staff exit and idle reset
  let holdT = 0, pin = '';
  const lock = $('#lock'), PINLEN = String(cfg.staffPin || '1234').length;
  const unhold = () => { clearTimeout(holdT); lock.classList.remove('holding'); };
  lock.addEventListener('pointerdown', e => { e.preventDefault(); if (typeof storyStop === 'function' && story.on) { clearInterval(story.t); story.on = false; $('#story').hidden = true; $('#k').classList.remove('story-on'); } lock.classList.add('holding'); holdT = setTimeout(() => { unhold(); pin = ''; showPin(); $('#pinModal').hidden = false; }, 3000); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => lock.addEventListener(t, unhold));
  function showPin(bad) { $('#pinShow').textContent = '•'.repeat(pin.length) + '·'.repeat(Math.max(0, PINLEN - pin.length)); $('#pinShow').classList.toggle('bad', !!bad); }
  $('#pinPad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Back'].map(k => `<button type="button" data-k="${k}"${k.length > 1 ? ' style="font-size:16px"' : ''}>${k}</button>`).join('');
  $('#pinPad').querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k; if (k === 'Clear') pin = ''; else if (k === 'Back') pin = pin.slice(0, -1); else if (pin.length < PINLEN) pin += k;
    showPin();
    if (pin.length === PINLEN) { if (pin === String(cfg.staffPin)) { $('#pinModal').hidden = true; $('#staffModal').hidden = false; P.send({ t: 'ping' }); link(); } else { pin = ''; showPin(true); } }
  });
  $('#pinCancel').onclick = () => { $('#pinModal').hidden = true; };
  $('#staffBack').onclick = () => { $('#staffModal').hidden = true; };
  $('#openProj').onclick = () => { if (!outs.has(0)) window.open('project.html?out', 'aiarg-projector', 'popup,width=1280,height=800'); if (nProj() === 2 && !outs.has(1)) window.open('project.html?out=2', 'aiarg-projector-2', 'popup,left=80,top=80,width=1280,height=800'); };
  const ttReset = () => { ttErr = ''; ttB = -1; if (map.getLayer('traffic')) map.removeLayer('traffic'); if (map.getSource('traffic')) map.removeSource('traffic'); showLayers(); };
  $('#ttTest').onclick = async () => { $('#ttState').textContent = 'Asking TomTom…'; const r = await TT.test(); $('#ttState').textContent = r.msg; if (r.ok) { ttReset(); P.send({ t: 'tt-key' }); } };
  $('#ttSave').onclick = () => { TT.setKey($('#ttKey').value); $('#ttKey').value = ''; ttErr = ''; ttB = -1; if (map.getSource('traffic')) { map.removeLayer('traffic'); map.removeSource('traffic'); } P.send({ t: 'tt-key' }); showLayers(); $('#ttState').textContent = TT.key() ? 'Key saved in this browser.' : 'Key removed.'; };
  $('#openScreen').onclick = () => { if (!screens.size) window.open('screen.html', 'aiarg-screen', 'popup,left=120,top=120,width=1280,height=720'); };
  $('#goCal').onclick = () => window.open('project.html', 'aiarg-projection');
  $('#full').onclick = () => document.documentElement.requestFullscreen?.().catch(() => { });
  $('#resetNow').onclick = () => { $('#staffModal').hidden = true; reset(); };
  function touch() { lastTouch = Date.now(); }
  ['pointerdown', 'keydown', 'wheel'].forEach(t => addEventListener(t, touch, { passive: true }));
  function reset() {
    K = DEF(); lastLayer = null; lastQ = null; touched = false; $('#insp').hidden = true; $('#pinModal').hidden = true;
    document.querySelectorAll('.k-preset').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#result').innerHTML = '<span class="k-dim">Pick a question. The answer lights up on the model.</span>';
    $('#areaKey').value = K.areaKey; syncTiles(); tab('water'); water(true); homeView();
  }
  setInterval(() => {
    const idle = Date.now() - lastTouch;
    // lastTouch moves only on a real touch, so the story's own changes never count as someone using the kiosk
    const staffOpen = !$('#staffModal').hidden || !$('#pinModal').hidden;
    if (cfg.story !== false) { if (!story.on && !staffOpen && idle > (+cfg.storyAfterSeconds || 40) * 1000) storyStart(); }
    else if (touched && !staffOpen && idle > (+cfg.idleSeconds || 180) * 1000) reset();
  }, 5000);

  // ---------------------------------------------------------------- attract loop: a short story while nobody is using the kiosk
  // Each step sets the water and one layer, and writes a caption from the data itself. A touch anywhere stops it.
  const story = { on: false, i: 0, t: 0 };
  const STEP_MS = (+cfg.storyStepSeconds || 9) * 1000;
  function only(ids) { Object.keys(K.layers).forEach(k => { K.layers[k] = BASE.has(k); }); ids.forEach(id => { if (id in K.layers || LAYERS.some(l => l.id === id)) K.layers[id] = true; }); syncTiles(); }
  function seaAt(level, rp, ids = []) { only(ids); K.src = 'coast'; K.level = level; K.rp = rp; water(true); const r = waterReached(); return summary(D, r); }
  function noWater(ids) { only(ids); water(false); showLayers(); sendState(); }
  const listNames = (a, n) => a.length <= n ? a.join(' and ').replace(/ and (?=.* and )/g, ', ') : a.slice(0, n).join(', ') + ' and others';
  const STEPS = [
    () => { const s = seaAt(0, 100); return ['Today', `A storm tide that comes once a century already reaches ${fmtN(s.count)} buildings in Sligo, along the quays and the river.`]; },
    () => { const s = seaAt(0.5, 100); return ['About 2100: the sea 0.5 m higher', `The same storm then reaches ${fmtN(s.count)} buildings.`]; },
    () => { const s = seaAt(1, 100); return ['About 2100: the sea 1 m higher', `${fmtN(s.count)} buildings and ${fmtN(s.homes)} homes are in the flood zone.`]; },
    () => { const s = seaAt(2, 2); return ['The sea 2 m higher', `Then a storm tide expected every other winter reaches ${fmtN(s.count)} buildings.`]; },
    NH && (() => { seaAt(1, 100, ['niah']); const hit = NH.items.filter(o => o.fz1), nat = [...new Set(hit.filter(o => o.rating === 'National').map(o => o.name))];
      return ['Heritage in the water\'s way', `${fmtN(hit.length)} buildings in the National Inventory of Architectural Heritage stand in that flood zone${nat.length ? ', among them ' + listNames(nat, 3) : ''}.`]; }),
    PW && (() => { seaAt(0, 100, ['power']); const n = PW.pts.filter(p => (p.k === 'sub' || p.k === 'tx') && p.fz).length;
      return ['When the water reaches the wires', `${fmtN(n)} local substations and transformers are already inside today's flood zone. When one floods, the power cut reaches well beyond the water.`]; }),
    NA && (() => { noWater(['nature']); const n = D.B.filter(b => b.properties.pz != null && b.properties.pz <= 50).length;
      return ['The river is protected too', `The Garavogue is part of Lough Gill Special Area of Conservation. ${fmtN(n)} buildings stand within 50 m of a protected site.`]; }),
    PL && (() => { K.planY = PL.last; K.planOnly = false; $('#planY').value = PL.last; noWater(['planning']); const g = PL.shown(PL.last, false), fz = g.filter(a => a.fz);
      return ['Sligo keeps building', `Since 2017, ${fmtN(g.length)} planning permissions for about ${fmtN(g.reduce((t, a) => t + a.h, 0))} new homes. ${fmtN(fz.length)} of the sites are in today's flood zones.`]; }),
    () => { only([]); K.src = 'sea'; K.level = 3; water(true); return ['As Water Arrives', 'Touch the screen to raise the water yourself, and ask the town your own questions.']; }
  ].filter(Boolean);
  function storyShow() {
    const [h, t] = STEPS[story.i](); tab('water'); homeView();
    $('#storyH').textContent = h; $('#storyT').textContent = t; story.h = h; story.text = t; screenSoon();
    $('#storyDots').innerHTML = STEPS.map((_, j) => `<i${j === story.i ? ' class="on"' : ''}></i>`).join('');
    $('#story').classList.remove('fade'); void $('#story').offsetWidth; $('#story').classList.add('fade');
  }
  function storyStart() {
    if (story.on) return; story.on = true; story.i = 0; $('#story').hidden = false; $('#k').classList.add('story-on'); $('#insp').hidden = true;
    storyShow(); story.t = setInterval(() => { story.i = (story.i + 1) % STEPS.length; storyShow(); }, STEP_MS);
  }
  function storyStop() {
    if (!story.on) return; story.on = false; clearInterval(story.t); $('#story').hidden = true; $('#k').classList.remove('story-on');
    K = DEF(); lastLayer = null; lastQ = null; syncTiles(); tab('water'); water(true); touched = true; touch();
  }
  $('#story').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); storyStop(); });
  $('#staffStory').onclick = () => { $('#staffModal').hidden = true; storyStart(); };

  // ---------------------------------------------------------------- the story screen: a large monitor beside the model (screen.html)
  // It shows in words, numbers and pictures what the model is showing. The kiosk works out everything; the screen only draws it.
  const IMG = cfg.screenImages || {};
  const nOn = () => LAYERS.filter(l => K.layers[l.id] && !BASE.has(l.id)).map(l => l.id);
  const st = (v, l, hot) => [typeof v === 'number' ? fmtN(v) : v, l, !!hot];
  const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
  const levelLabel = v => K.src === 'opw' ? OPWNAME[v] : K.src === 'coast' ? (v ? '+' + fmtN(v, 1) + ' m' : 'Today') : fmtN(v, 1) + ' m';
  function floodChart() {
    const lv = levels(); if (lv.length < 2) return null;
    return { title: K.src === 'coast' ? `Buildings in the 1-in-${K.rp}-year sea flood zone as the sea rises` : K.src === 'opw' ? `Buildings in the river flood zone, ${FUTNAME[K.fut]}` : `Buildings the ${K.src === 'sea' ? 'sea' : 'lake'} reaches, by water level (m OD)`,
      bars: lv.map(v => [levelLabel(v), waterReached(v).ids.length, v === K.level]) };
  }
  function floodInfo() {
    const r = waterReached(), s = summary(D, r), f = FJ.features.find(x => isMine(x.properties)), z = K.src === 'opw' || K.src === 'coast';
    const RP = { 2: 'A storm tide every other year', 20: 'A 1-in-20-year storm tide', 100: 'A once-a-century storm tide' };
    const h = K.src === 'coast' ? RP[K.rp] + (K.level ? `, with the sea ${fmtN(K.level, 1)} m higher` : ', today')
      : K.src === 'opw' ? `The river in flood: ${OPWNAME[K.level]}${K.fut === 'now' ? '' : ', ' + FUTNAME[K.fut]}` : `${K.src === 'sea' ? 'The sea' : 'Lough Gill'} at ${fmtN(K.level, 1)} m OD`;
    return { h, water: K.src === 'opw' || K.src === 'coast' ? floodName() : null, text: floodText(), chart: floodChart(),
      stats: [st(s.count, z ? 'buildings in the flood zone' : 'buildings the water reaches', 1), st(s.homes, 'homes in them'), st(s.commercial, 'commercial units'), f ? st(fmtN(f.properties.ha) + ' ha', z ? 'in the flood zone, inside the circle' : 'under water, inside the circle') : null].filter(Boolean) };
  }
  const ABOUT = {
    areas: () => ({ h: 'Census areas', text: `Each patch is a census small area from Census 2022, usually about 80 to 120 homes, coloured by: ${$('#areaKey').selectedOptions[0]?.textContent || 'the indicator chosen'}. Comparing them with the water shows who lives where the water arrives.` }),
    zoning: () => ({ h: 'Zoning', text: 'The development plan gives every piece of land a use: town centre, homes, open space, industry. Zoning decides where Sligo can grow, and so whether new building goes into the water\'s way or away from it.' }),
    mon: () => ({ h: 'Recorded monuments', text: 'Sites in the Record of Monuments and Places, protected under the National Monuments Acts. The oldest parts of the town grew at the river crossing, which is also where the water comes first.' }),
    scheme: () => ({ h: 'A new river crossing', text: 'The proposed Garavogue road and bridge, drawn from the council\'s 2018 design. A new crossing changes how people move through the town, and it is built where the river meets the tide.' }),
    relief: () => ({ h: 'The shape of the land', text: 'Shaded relief from the lidar terrain. The town climbs away from the river on every side; the low land along the river, the quays and the bay is where the water goes first.' }),
    grid: () => ({ h: 'How the model is made', text: `The model is ${fmtN(MJ.tiles.length)} 3D-printed tiles at 1:2500, a circle reaching one Irish mile (about 2 km) from Lady Erin. Buildings are printed at their measured height, or an estimate where none was measured.` }),
    opw: () => ({ h: 'Where the river floods', text: 'The OPW\'s flood maps for the Garavogue (floodinfo.ie): the land with a 10%, 5% and 1% chance of flooding from the river in any one year. Indicative only; see floodinfo.ie for the official maps.' }),
    buses: () => ({ h: 'The town buses', text: `Sligo's town routes ${BUS.routes.map(r => r.id).join(', ').replace(/, (?=[^,]*$)/, ' and ')}, each dot a bus where the timetable puts it. ${K.busFast ? 'A whole day runs in three minutes.' : 'They move in real time.'} Bus routes run along the quays and across the bridges, so a flood stops more than the streets it covers.` }),
    traffic: () => ({ h: 'Traffic', text: live() && !K.busFast ? 'Live traffic from TomTom, updated every 5 minutes: green flows freely, red is slow. Most traffic crossing the town uses a few bridges and the quays, close to the water.' : 'Typical traffic on the main roads for this time of day: green flows freely, red is slow. Most traffic crossing the town uses a few bridges and the quays, close to the water.' }),
    planning: () => { const g = PL.shown(K.planY, K.planOnly), by = {}; PL.shown(PL.last, false).forEach(a => { const y = Math.max(a.y, PL.first); by[y] = (by[y] || 0) + a.h; });
      const ys = []; for (let y = PL.first; y <= PL.last; y++) ys.push([String(y), by[y] || 0, y === K.planY]);
      return { h: K.planOnly ? `Planning permissions in ${K.planY}` : `Planning permissions, 2017 to ${K.planY}`, text: 'Planning permissions granted by Sligo County Council, coloured by what they are for. A permission is not a building started, but it shows where the town means to grow, and how much of that is near the water.',
        stats: [st(g.length, 'permissions', 1), st(g.reduce((t, a) => t + a.h, 0), 'new homes permitted'), st(g.filter(a => a.fz).length, 'sites in today\'s flood zones')], chart: { title: 'New homes permitted each year', bars: ys } }; },
    nature: () => ({ h: 'Protected nature', text: `The Garavogue joins two places protected by European law: ${[...new Set(NA.sites.filter(x => x.k === 'sac').map(x => x.name))].join(' and ')}. Sea and river rising change these habitats too: salt marsh and mudflats need room to move inland.`,
      stats: [st(D.B.filter(b => b.properties.pz != null && b.properties.pz <= 50).length, 'buildings within 50 m of a protected site', 1), ...NA.sites.filter(x => x.k !== 'pnha').map(x => st(fmtN(x.hain) + ' ha', `${AW.NATURE[x.k][1]}: ${x.name}`))].slice(0, 4) }),
    niah: () => { const c = r => NH.items.filter(o => o.rating === r).length;
      return { h: 'Architectural heritage', text: 'Buildings in the National Inventory of Architectural Heritage, coloured by how important they are: national, regional or local. Much of Sligo\'s 18th- and 19th-century town stands along the river and the quays.',
        stats: [st(NH.items.length, 'buildings in the inventory'), st(c('National'), 'of national importance'), st(NH.items.filter(o => o.fz).length, 'in today\'s 1-in-100-year flood zones', 1), st(NH.items.filter(o => o.fz1).length, 'with the sea 1 m higher', 1)] }; },
    power: () => { const sub = PW.pts.filter(p => p.k === 'sub' || p.k === 'tx');
      return { h: 'Electricity', text: 'Lines, substations and transformers from OpenStreetMap and Tailte Éireann mapping. A flooded substation cuts the power to streets well beyond the water, including to pumps, phones and lifts.',
        stats: [st(sub.length, 'substations and transformers'), st(sub.filter(p => p.fz).length, 'in today\'s 1-in-100-year flood zone', 1), st(sub.filter(p => p.fz1).length, 'with the sea 1 m higher', 1)] }; },
    cycle: () => ({ h: 'Cycle routes', text: 'Cycle tracks, shared paths and painted lanes from OpenStreetMap. Many of the best routes follow the river and the shore, the same flat land the water reaches first.',
      stats: Object.entries(AW.CYCLE).filter(([k]) => CY.km[k]).map(([k, [, n]]) => st(fmtN(CY.km[k], 1) + ' km', n)).concat([st(CY.parking.length, 'bike parking places')]).slice(0, 4) })
  };
  Object.values(UT).forEach(u => { ABOUT[u.id] = () => ({ h: u.name, text: u.id === 'sewer' ? 'The pipes under the streets: wastewater runs downhill to the treatment plant, and some pipes empty into the river and the bay at outfalls. When the tide is high an outfall can be closed by the sea, so heavy rain and a high tide together flood streets far from the shore.'
    : 'Drinking water reaches the town through mains from its sources and reservoirs on higher ground. Each colour is a supply zone, the area served from one source.' }); });
  function screenInfo() {
    const ids = nOn(), lay = ids.includes(lastLayer) ? lastLayer : ids[ids.length - 1];
    let o, topic;
    if (K.query && lastQ) {
      const s = summary(D, lastQ.r), b = lastQ.r.tgt === 'b'; topic = 'ask';
      o = { h: cap(lastQ.label), text: b ? 'The buildings that answer the question light up on the model in amber.' : 'The census areas that answer the question light up on the model in amber.',
        stats: b ? [st(s.count, 'buildings', 1), st(s.homes, 'homes'), st(s.vacantHomes, 'vacant homes'), st(s.vacantCommercial, 'vacant commercial units')] : [st(s.count, 'census small areas', 1), st(s.population, 'people'), st(s.households, 'households')] };
      if (K.flood) o.chart = floodChart();
    } else if (lay && ABOUT[lay]) {
      topic = lay; o = ABOUT[lay]();
      if (K.flood) { const f = floodInfo(); o.water = f.water; if (!o.stats) o.stats = f.stats; if (!o.chart) o.chart = f.chart; }
    } else if (K.flood) { topic = K.src; o = floodInfo(); }
    else { topic = 'welcome'; o = { h: 'As Water Arrives', text: 'A model of Sligo at 1:2500, one Irish mile from Lady Erin. Use the screen beside it to raise the water, switch on the town\'s layers and ask it questions. What you choose is projected onto the model and explained here.' }; }
    o.topic = topic; o.img = IMG[topic] || null; return o;
  }
  let scrT = 0, snapT = 0;
  function screenSoon() { if (!screens.size) return; clearTimeout(scrT); scrT = setTimeout(() => screenSend(), 300); }
  function screenSend(now) {
    if (!screens.size || !ready) return;
    const o = screenInfo();
    if (story.on) { o.h = story.h || o.h; o.text = story.text || o.text; o.mode = 'story'; o.step = [story.i, STEPS.length]; } else o.mode = 'live';
    o.legend = lastL.slice(0, 9).map(([c, t]) => [c, t]);
    P.send({ t: 'screen', s: o });
    clearTimeout(snapT); snapT = setTimeout(snap, now ? 50 : 1700);   // after the map has flown home
  }
  function snap() {                                         // a picture of the kiosk's map, for when there is no photograph for the topic
    if (!screens.size) return;
    map.once('idle', () => map.once('render', () => { try { const c = map.getCanvas(), w = 960, h = Math.round(w * c.height / c.width), o = document.createElement('canvas'); o.width = w; o.height = h;
      o.getContext('2d').drawImage(c, 0, 0, w, h); P.send({ t: 'screen-map', src: o.toDataURL('image/jpeg', .82) }); } catch (e) { } }));
    map.triggerRepaint();
  }

  // ---------------------------------------------------------------- go
  ready = true;
  $('#areaKey').value = K.areaKey; syncTiles(); tab('water'); water(true); touched = false;
  $('#boot').classList.add('done');
})().catch(e => { const m = document.getElementById('bootMsg'); if (m) m.textContent = 'Could not start: ' + e.message; console.error(e); });
