/* Underground networks: the 2008 sewer network (data/sewer.json) and, when present, the water mains
   (data/watermains.json). Both are lines in ITM; a sewer pipe with f=1 runs downstream from its first point.
   flowDots(net, t) gives points moving downstream along those pipes, for the projector. */
(function () {
  'use strict';
  const NETS = {
    sewer: { file: 'data/sewer.json', col: '#d29b5c', dot: '#ffe2b8', name: 'Sewers', sub: '2008 network, flowing to the outfalls' },
    watermains: { file: 'data/watermains.json', col: '#38d6f5', dot: '#d8f8ff', name: 'Water mains', sub: 'Public supply pipes, 2007' }
  };
  // cycling (data/cycle.json): lines by kind, and bike parking
  AW.CYCLE = { track: ['#19d38a', 'Cycle track, away from traffic'], path: ['#8ff0d2', 'Path shared with walkers'], lane: ['#e6f04f', 'Painted cycle lane'], shared: ['#ff9ec8', 'Shared lane or bus lane'] };
  AW.cycling = async function () {
    const J = await AW.getJSON('data/cycle.json').catch(() => null); if (!J) return null;
    J.lines.forEach(l => { const c = l.c; l.xy = []; for (let i = 0; i < c.length; i += 2) l.xy.push([c[i], c[i + 1]]); });
    return J;
  };
  // planning permissions (data/planning.json): types and colours, and a loader
  AW.PLAN = { homes: ['#ff6b6b', 'New homes'], ext: ['#f9c74f', 'Extensions and alterations'], change: ['#b388ff', 'Change of use'], com: ['#2ec4b6', 'Commercial and community'], minor: ['#9aa5b1', 'Signs and minor works'] };
  AW.planning = async function () {
    const J = await AW.getJSON('data/planning.json').catch(() => null); if (!J) return null;
    J.apps.forEach(a => { if (a.r) a.rings = a.r.map(c => { const xy = []; for (let i = 0; i < c.length; i += 2) xy.push([c[i], c[i + 1]]); return xy; }); });
    J.first = 2017; J.last = J.years[1];
    // what the timeline shows at year y: granted up to y (or in y only); earlier permissions count from the first year
    J.shown = (y, only) => J.apps.filter(a => a.dec === 'granted' && (only ? Math.max(a.y, J.first) === y : a.y <= y));
    return J;
  };
  // new homes sold (data/newhomes.json): Property Price Register new-dwelling sales in the circle, counted by place; no addresses or prices
  AW.NEWHOMES = [[2010, 2014, '#94d2bd', '2010–2014'], [2015, 2019, '#e9d8a6', '2015–2019'], [2020, 2023, '#ee9b00', '2020–2023'], [2024, 2099, '#ff4d6d', '2024 on']];
  AW.newHomeCol = y => (AW.NEWHOMES.find(b => y >= b[0] && y <= b[1]) || AW.NEWHOMES[0])[2];
  AW.newhomes = async function () {
    const J = await AW.getJSON('data/newhomes.json').catch(() => null); if (!J) return null;
    J.places.forEach(p => { let t = 0, h = p.n / 2; p.ym = p.y0; for (const [y, c] of Object.entries(p.by)) { t += c; if (t >= h) { p.ym = +y; break; } } });   // median year of sale
    return J;
  };
  // Sligo County Council land registers (data/registers.json): Vacant Sites Register (2024) and the Residential Zoned Land Tax map (2026)
  AW.VACANT = ['#ff2e63', 'Vacant Sites Register (Sligo County Council, 2024)'];
  AW.RZLT = { new: ['#ffd166', 'New residential land'], infill: ['#b39ddb', 'Existing residential and infill land'], centre: ['#ff9f43', 'Town centre land'], mixed: ['#4dd0e1', 'Mixed-use and neighbourhood centre land'] };
  AW.registers = async function () {
    const J = await AW.getJSON('data/registers.json').catch(() => null); if (!J) return null;
    const xy = c => { const o = []; for (let i = 0; i < c.length; i += 2) o.push([c[i], c[i + 1]]); return o; };
    J.vacant.forEach(v => { v.rings = v.r.map(p => p.map(xy)); }); J.rzlt.forEach(p => { p.rings = p.r.map(q => q.map(xy)); });
    return J;
  };
  // shoreline of the docks (data/shoreline.json): land won from the sea by period, and the high-water lines of 1837, 1910 and 2023
  AW.SHORE = { pre1837: ['#e3a54a', 'Enclosed behind the Ballast Wall, before 1837'], '1837_1910': ['#ff6b5a', 'Railway causeway and Deepwater Quay, 1837–1910'], after_1910: ['#4cc08f', 'The Upper Flat, filled after 1940'] };
  AW.SHORELINE = { 1837: ['#e3a54a', 'High water, 1837', [6, 4]], 1910: ['#ff6b5a', 'High water, 1910', []], 2023: ['#5aa2ff', 'High water, 2023', []] };
  AW.shoreline = async function () {
    const J = await AW.getJSON('data/shoreline.json').catch(() => null); if (!J) return null;
    const xy = c => { const o = []; for (let i = 0; i < c.length; i += 2) o.push([c[i], c[i + 1]]); return o; };
    J.periods.forEach(p => { p.rings = p.r.map(poly => poly.map(xy)); }); J.lines.forEach(l => { l.pts = xy(l.xy); });
    return J;
  };
  // protected nature sites (data/protected.json)
  AW.NATURE = { sac: ['#5fd38d', 'SAC'], spa: ['#ffa94d', 'SPA'], nha: ['#e8f59a', 'NHA'], pnha: ['#e8f59a', 'pNHA'] };
  AW.nature = async function () {
    const J = await AW.getJSON('data/protected.json').catch(() => null); if (!J) return null;
    J.sites.forEach(s => { s.rings = s.r.map(poly => poly.map(c => { const xy = []; for (let i = 0; i < c.length; i += 2) xy.push([c[i], c[i + 1]]); return xy; })); });
    return J;
  };
  AW.SUPPLY = { FOX: '#3a86ff', K: '#ff9f1c', C: '#2ec4b6', F: '#c77dff' };           // water supply zones by source
  // electricity network points (data/electric.json): substations, transformer poles, pylons, poles
  // electricity (data/electric.json): OSM lines by voltage and ESB substations; points from OSM and Tailte Éireann mapping
  AW.POWER = { sub: ['#ffd60a', 'Local substations (mini-pillars and kiosks)'], tx: ['#ff9f1c', 'Transformers'], gen: ['#7bdff2', 'Solar panels'], pylon: ['#ff5d8f', 'ESB pylons'], pole: ['#cfd8dc', 'Electricity poles'] };
  AW.VOLT = { '110kv': ['#ff0054', '110 kV line'], '38kv': ['#ff5d8f', '38 kV line'], mv: ['#ffd60a', '10 kV line'], lv: ['#cfd8dc', 'Low-voltage line'], unknown: ['#ffe8a3', 'Line, voltage not recorded'] };
  AW.power = async function () {
    const J = await AW.getJSON('data/electric.json').catch(() => null); if (!J) return null;
    const xy = c => { const o = []; for (let i = 0; i < c.length; i += 2) o.push([c[i], c[i + 1]]); return o; };
    J.pts = J.points.map(([k, x, y, fz, fz1]) => ({ k, x, y, fz, fz1 }));
    J.cov = (J.coverage || []).map(xy);
    (J.lines || []).forEach(l => { l.xy = xy(l.c); });
    (J.subs || []).forEach(s => { if (s.r) s.ring = xy(s.r); });
    return J;
  };
  // NIAH: architectural heritage (data/niah.json), each record matched to a building (b = index in buildings.json)
  AW.NIAH = { National: ['#ff4d6d', 'National'], Regional: ['#f4a261', 'Regional'], Local: ['#e9c46a', 'Local'] };
  AW.niah = async function () { return await AW.getJSON('data/niah.json').catch(() => null); };
  AW.utilities = async function () {
    const out = {};
    await Promise.all(Object.entries(NETS).map(async ([k, n]) => {
      const J = await AW.getJSON(n.file).catch(() => null); if (!J) return;
      const lines = J.pipes.map(p => { const c = p.c, xy = []; for (let i = 0; i < c.length; i += 2) xy.push([c[i], c[i + 1]]); const d = [0]; for (let i = 1; i < xy.length; i++) d.push(d[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1])); return { xy, d, f: p.f, len: d[d.length - 1] }; });
      const zones = (J.zones || []).map(z => Object.assign(z, { rings: z.r.map(c => { const xy = []; for (let i = 0; i < c.length; i += 2) xy.push([c[i], c[i + 1]]); return xy; }) }));
      out[k] = Object.assign({ id: k, J, lines, points: { outfall: J.outfall || [], weir: J.weir || [] }, plants: J.plants || [], zones, tanks: J.tanks || [] }, n);
    }));
    return out;
  };
  // dots every GAP metres, moving downstream at SPEED (exaggerated so the movement reads)
  const GAP = 45, SPEED = 18;
  AW.flowDots = function (net, now = Date.now()) {
    const off = (now / 1000 * SPEED) % GAP, pts = [];
    net.lines.forEach(l => {
      if (!l.f || l.len < 2) return; let j = 0;
      for (let s = off % GAP; s < l.len; s += GAP) { while (j < l.d.length - 2 && l.d[j + 1] < s) j++; const f = (s - l.d[j]) / Math.max(1e-6, l.d[j + 1] - l.d[j]); pts.push([l.xy[j][0] + (l.xy[j + 1][0] - l.xy[j][0]) * f, l.xy[j][1] + (l.xy[j + 1][1] - l.xy[j][1]) * f]); }
    });
    return pts;
  };
})();
