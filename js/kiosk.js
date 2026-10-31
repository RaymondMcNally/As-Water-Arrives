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
  OPW.features.forEach(f => FJ.features.push({ type: 'Feature', properties: { src: 'opw', level: f.properties.aep, ha: f.properties.ha }, geometry: f.geometry }));
  const OPWNAME = { 10: '1 in 10 years', 5: '1 in 20 years', 1: '1 in 100 years' };
  const D = { B: BJ.features, A: AJ.features, SA: {} };
  D.A.forEach((a, i) => { D.SA[a.properties.sa_pub2022] = a.properties; });
  const LEVELS = { opw: [10, 5, 1], sea: [...new Set(FJ.features.filter(f => f.properties.src === 'sea').map(f => f.properties.level))].sort((a, b) => a - b),
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
  const DEF = () => ({ tab: 'water', src: 'sea', level: 3.0, flood: true, preset: -1, query: null, layers: Object.fromEntries(LAYERS.map(l => [l.id, l.on])), areaKey: 'pct_ber_e_to_g', busFast: false });
  let K = DEF(), touched = false, lastTouch = Date.now();
  let litB = new Set(), litA = new Set(), ready = false;
  const P = bus(m => { if (ready) onMsg(m); });
  const outs = new Set();                                   // projector windows open (0 = projector 1, 1 = projector 2)
  const nProj = () => { try { return (JSON.parse(localStorage.getItem('aiarg-projector-v2') || '{}').n) === 2 ? 2 : 1; } catch (e) { return 1; } };

  const BUS = await AW.buses();
  const TT = AW.traffic; TT.setConfigKey(cfg.tomtomKey); let ttB = -1, ttErr = '', ttRetry = 0;
  const TY = AW.typicalTraffic; let tyStep = null;
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
    const on = K.layers.traffic && !live(); map.setLayoutProperty('typ', 'visibility', on ? 'visible' : 'none'); if (!on) { tyStep = null; return; }
    const c = BUS.clock(K.busFast), st = TY.step(c) + (c.fast ? 'f' : '') + c.day; if (st === tyStep) return; tyStep = st;
    typFC.features.forEach(f => { f.properties.col = TY.colour(TY.level(f.properties.fc, f.properties.d, c)); }); map.getSource('typ').setData(typFC);
    const el = $('#typClock'); if (el) el.textContent = `Typical traffic at ${BUS.hhmm(Math.floor(c.t / 600) * 600)}, ${c.fast ? 'weekday' : BUS.dayName[c.day]} · modelled, not live`;
  }
  function trafficTick() {
    typTick();
    const on = K.layers.traffic && live(), b = TT.bucket();
    if (!on) { if (map.getLayer('traffic')) map.setLayoutProperty('traffic', 'visibility', 'none'); return; }
    if (!map.getSource('traffic')) {
      map.addSource('traffic', { type: 'raster', tiles: [TT.template(b)], tileSize: 256, minzoom: 12, maxzoom: 15, attribution: '© TomTom' });
      map.addLayer({ id: 'traffic', type: 'raster', source: 'traffic', paint: { 'raster-opacity': .95 } }, 'b'); ttB = b;
    } else if (ttB !== b) { map.getSource('traffic').setTiles([TT.template(b)]); ttB = b; }
    map.setLayoutProperty('traffic', 'visibility', 'visible');
  }
  map.on('error', e => { if (e.sourceId === 'traffic' && !ttErr) { ttErr = 'TomTom did not load'; trafficTick(); legend(); TT.test().then(r => { if (r.ok && ttRetry++ < 2) { $('#ttState').textContent = 'Live traffic restarted: ' + r.msg; ttReset(); P.send({ t: 'tt-key' }); } else $('#ttState').textContent = 'Live traffic is off: ' + r.msg; }); } });
  setInterval(trafficTick, 15000);
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
    map.setFilter('flood', on ? f : ['==', 'level', -1]); map.setFilter('flood-line', on ? f : ['==', 'level', -1]);
    map.setPaintProperty('flood', 'fill-color', K.src === 'sea' ? C.sea : K.src === 'lake' ? C.lake : C.opw);
  }
  function showLayers() {
    const vis = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('roads', K.layers.roads); vis('water', K.layers.water); vis('zoning', K.layers.zoning); vis('mon', K.layers.mon);
    vis('scheme', K.layers.scheme); vis('opw', K.layers.opw); vis('tiles', K.layers.grid); vis('hs', true); map.setPaintProperty('hs', 'raster-opacity', K.layers.relief ? .8 : .45);
    vis('area-fill', K.layers.areas); trafficTick(); vis('bus', K.layers.buses); vis('bus-lines', K.layers.buses); $('#busCtl').hidden = !K.layers.buses && !K.layers.traffic; busTick();
    if (K.layers.areas) { const cm = areaColours(D.A, K.areaKey), pairs = []; D.A.forEach(a => { const c = cm.get(a.properties[K.areaKey]); if (c) pairs.push(a.properties.sa_pub2022, c); });
      map.setPaintProperty('area-fill', 'fill-color', pairs.length ? ['match', ['get', 'sa_pub2022'], ...pairs, 'rgba(0,0,0,0)'] : 'rgba(0,0,0,0)'); }
    legend();
  }
  function legend() {
    const L = [];
    if (K.flood) L.push(K.src === 'opw' ? [C.opw, `OPW river flood map: ${OPWNAME[K.level]}`] : [K.src === 'sea' ? C.sea : C.lake, `${K.src === 'sea' ? 'Sea' : 'Lough Gill'} at ${fmtN(K.level, 1)} m OD`]);
    if (K.layers.opw) [10, 5, 1].forEach(a => L.push([C.opwBands[a], 'OPW flood map, ' + OPWNAME[a]]));
    if (litB.size) L.push([C.match, K.flood && !K.query ? (K.src === 'opw' ? 'Buildings in the flood zone' : 'Buildings the water reaches') : 'Answer to your question']);
    if (litA.size) L.push([C.match, 'Census areas that match']);
    if (K.layers.areas) areaColours(D.A, K.areaKey).legend.forEach(x => L.push(x));
    if (K.layers.scheme) L.push([C.scheme, 'Proposed Garavogue crossing']);
    if (K.layers.traffic) { (live() ? TT.legend : TY.legend).forEach(x => L.push(x)); if (TT.key() && ttErr) L.push(['#555', 'Live TomTom data did not load (see staff panel)']); }
    if (K.layers.buses) BUS.routes.forEach(r => L.push([r.col, `Bus ${r.id}: ${r.name.replace(/ - /g, ' – ')}`]));
    $('#legend').innerHTML = L.map(([c, t]) => `<div><i style="background:${c}"></i>${esc(t)}</div>`).join('') + (K.layers.buses ? '<div class="k-busclock" id="busClock"></div>' : '') + (K.layers.traffic ? (live() ? '<div class="k-busclock">Traffic © TomTom, live, updated every 5 minutes</div>' : '<div class="k-busclock" id="typClock"></div>') : '');
    tyStep = null;
    busTick();
  }

  // ---------------------------------------------------------------- 01 water arrives
  function waterReached() {
    if (K.src === 'opw') return run(D, { target: 'b', conditions: [{ field: 'op', op: '>=', value: K.level }] });
    const key = K.src === 'sea' ? 'fs' : 'fl';
    return run(D, { target: 'b', conditions: [{ field: key, op: '<=', value: K.level }] });
  }
  function setLevelUI() {
    const lv = LEVELS[K.src], i = Math.max(0, lv.indexOf(K.level));
    $('#lv').max = lv.length - 1; $('#lv').value = i;
    $('#lvTicks').innerHTML = lv.map(v => `<span>${K.src === 'opw' ? OPWNAME[v] : fmtN(v, 1)}</span>`).join('');
    $('#lvOut').textContent = K.src === 'opw' ? OPWNAME[K.level] : fmtN(K.level, 1) + ' m OD';
    $('#pWater .k-levelhead span').textContent = K.src === 'opw' ? 'A flood this likely' : 'Water level';
    $('#srcOpw').setAttribute('aria-pressed', K.src === 'opw'); $('#pWater').classList.toggle('k-opw', K.src === 'opw');
    $('#srcSea').setAttribute('aria-pressed', K.src === 'sea'); $('#srcLake').setAttribute('aria-pressed', K.src === 'lake');
    $('#pWater').classList.toggle('k-lake', K.src === 'lake');
  }
  function water(on = true) {
    K.flood = on; K.query = null; K.preset = -1;
    setLevelUI(); showFlood();
    const r = waterReached(), s = summary(D, r), f = FJ.features.find(x => x.properties.src === K.src && x.properties.level === K.level);
    setLit('b', on ? r.ids : []);
    const today = K.src === 'opw' ? 'OPW flood maps for the Garavogue (floodinfo.ie): the land with a 10%, 5% or 1% chance of river flooding in any one year. They model the river, not the sea; coastal flooding is mapped separately.' : K.src === 'sea' ? 'Sligo harbour is usually between about −1 and +2 m OD; the highest tides and surges have reached about 3 m.' : 'Lough Gill usually sits at about 3.8 m OD (lidar, 2011).';
    $('#wStats').innerHTML = on ? `
      <div class="k-stat hot"><b>${fmtN(s.count)}</b><span>buildings ${K.src === 'opw' ? 'in the flood zone' : 'reached'}</span></div>
      <div class="k-stat"><b>${fmtN(s.homes)}</b><span>homes in them</span></div>
      <div class="k-stat"><b>${fmtN(f?.properties.ha)} ha</b><span>${K.src === 'opw' ? 'in the flood zone inside the circle, including the river' : 'under water inside the circle, including the river and bay'}</span></div>
      <div class="k-stat"><b>${fmtN(s.commercial)}</b><span>commercial units</span></div>` : '';
    $('#wNote').textContent = on ? today + (K.src === 'opw' ? ' Indicative only; see floodinfo.ie for the official maps and their conditions of use.' : ' This spreads water over the ground: it ignores tides, defences and drainage, so treat it as an illustration, not a flood map.') : '';
    showLayers(); sendState();
  }
  $('#srcSea').onclick = () => { touch(); K.src = 'sea'; K.level = 3.0; water(); };
  $('#srcLake').onclick = () => { touch(); K.src = 'lake'; K.level = 6.0; water(); };
  $('#srcOpw').onclick = () => { touch(); K.src = 'opw'; K.level = 10; water(); };
  $('#lv').oninput = e => { touch(); K.level = LEVELS[K.src][+e.target.value]; water(); };
  $('#wOff').onclick = () => { touch(); water(false); };

  // ---------------------------------------------------------------- 02 ask the town
  function showResult(r, label) {
    const s = summary(D, r), el = $('#result');
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
    if (p.flood) { K.src = p.flood.src; K.level = p.flood.level; K.flood = true; setLevelUI(); } else K.flood = false;
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
  LAYERS.forEach(l => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'k-tile'; b.dataset.id = l.id;
    b.innerHTML = `<i style="background:${l.col}"></i><span><b>${esc(l.n)}</b><small>${esc(l.s)}</small></span>`;
    b.onclick = () => { touch(); K.layers[l.id] = !K.layers[l.id]; syncTiles(); showLayers(); sendState(); };
    $('#layerTiles').append(b);
  });
  const syncTiles = () => { document.querySelectorAll('.k-tile').forEach(b => b.setAttribute('aria-pressed', !!K.layers[b.dataset.id])); $('#busReal').setAttribute('aria-pressed', String(!K.busFast)); $('#busFast').setAttribute('aria-pressed', String(!!K.busFast)); };
  $('#busReal').onclick = () => { touch(); K.busFast = false; syncTiles(); busTick(); sendState(); };
  $('#busFast').onclick = () => { touch(); K.busFast = true; syncTiles(); busTick(); sendState(); };
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
  function inspectA(i) {
    const p = D.A[i].properties;
    $('#insp').innerHTML = `<button type="button" class="x" aria-label="Close">×</button><h3>Census area ${esc(p.sa_pub2022)}</h3><span class="k-dim">${esc(p.ed_english || '')} · ${esc(p.dep_label || '')}</span>
      ${kv(['pop_total', 'households', 'pct_age_65_plus', 'pct_hh_no_car', 'pct_dwellings_vacant', 'pct_ber_e_to_g', 'pct_heat_oil', 'unemployment_rate'].map(k => [AF[k].l, fmtField('a.' + k, p[k])]))}`;
    $('#insp').hidden = false; $('#insp .x').onclick = () => { $('#insp').hidden = true; };
  }
  map.on('click', e => {
    touch();
    const f = map.queryRenderedFeatures(e.point, { layers: ['b'] })[0]; if (f) return inspectB(f.id);
    const a = map.queryRenderedFeatures(e.point, { layers: ['area-fill', 'a-sel'] })[0]; if (a) return inspectA(a.id);
    $('#insp').hidden = true;
  });

  // ---------------------------------------------------------------- the projector
  function sendState() {
    touched = true;
    P.send({ t: 'kiosk', s: { flood: K.flood ? { src: K.src, level: K.level } : null, sel: { tgt: litA.size ? 'a' : 'b', ids: litA.size ? [...litA] : [...litB] }, layers: K.layers, areaKey: K.areaKey, busFast: K.busFast } });
  }
  function onMsg(m) {
    if (m.t === 'hello' && m.who === 'out') { outs.add(m.i || 0); link(); sendState(); }
    if (m.t === 'bye' && m.who === 'out') { outs.delete(m.i || 0); link(); }
    if (m.t === 'want-kiosk') sendState();
  }
  function link() {
    const n = nProj(), have = [...outs].filter(i => i < n).length, el = $('#projLink');
    el.textContent = n === 1 ? (have ? 'Projector: connected' : 'Projector: not connected') : `Projectors: ${have} of 2 connected`; el.dataset.on = have === n ? '1' : '0';
    $('#staffStatus').textContent = have === n ? (n === 1 ? 'The projector window is open and following the kiosk.' : 'Both projector windows are open and following the kiosk.')
      : n === 1 ? 'No projector window is open in this browser. Open it, drag it to the projector and press F.'
      : `${have} of 2 projector windows are open. Open them, drag each to its projector and press F in each.`;
  }
  P.send({ t: 'ping' });

  // ---------------------------------------------------------------- staff exit and idle reset
  let holdT = 0, pin = '';
  const lock = $('#lock'), PINLEN = String(cfg.staffPin || '1234').length;
  const unhold = () => { clearTimeout(holdT); lock.classList.remove('holding'); };
  lock.addEventListener('pointerdown', e => { e.preventDefault(); lock.classList.add('holding'); holdT = setTimeout(() => { unhold(); pin = ''; showPin(); $('#pinModal').hidden = false; }, 3000); });
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
  $('#goCal').onclick = () => window.open('project.html', 'aiarg-projection');
  $('#full').onclick = () => document.documentElement.requestFullscreen?.().catch(() => { });
  $('#resetNow').onclick = () => { $('#staffModal').hidden = true; reset(); };
  function touch() { lastTouch = Date.now(); }
  ['pointerdown', 'keydown', 'wheel'].forEach(t => addEventListener(t, touch, { passive: true }));
  function reset() {
    K = DEF(); touched = false; $('#insp').hidden = true; $('#pinModal').hidden = true;
    document.querySelectorAll('.k-preset').forEach(b => b.setAttribute('aria-pressed', 'false'));
    $('#result').innerHTML = '<span class="k-dim">Pick a question. The answer lights up on the model.</span>';
    $('#areaKey').value = K.areaKey; syncTiles(); tab('water'); water(true); homeView();
  }
  setInterval(() => { if (touched && Date.now() - lastTouch > (+cfg.idleSeconds || 180) * 1000 && $('#staffModal').hidden) reset(); }, 5000);

  // ---------------------------------------------------------------- go
  ready = true;
  $('#areaKey').value = K.areaKey; syncTiles(); tab('water'); water(true); touched = false;
  $('#boot').classList.add('done');
})().catch(e => { const m = document.getElementById('bootMsg'); if (m) m.textContent = 'Could not start: ' + e.message; console.error(e); });
