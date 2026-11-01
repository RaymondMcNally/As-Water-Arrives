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
  // protected nature sites (data/protected.json)
  AW.NATURE = { sac: ['#5fd38d', 'SAC'], spa: ['#ffa94d', 'SPA'], nha: ['#e8f59a', 'NHA'], pnha: ['#e8f59a', 'pNHA'] };
  AW.nature = async function () {
    const J = await AW.getJSON('data/protected.json').catch(() => null); if (!J) return null;
    J.sites.forEach(s => { s.rings = s.r.map(poly => poly.map(c => { const xy = []; for (let i = 0; i < c.length; i += 2) xy.push([c[i], c[i + 1]]); return xy; })); });
    return J;
  };
  AW.SUPPLY = { FOX: '#3a86ff', K: '#ff9f1c', C: '#2ec4b6', F: '#c77dff' };           // water supply zones by source
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
