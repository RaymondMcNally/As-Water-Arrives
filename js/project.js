/* Projection onto the round 1:2500 Sligo model, with one or two projectors. One script, three kinds of window:
   project.html        controls, calibration and a preview
   project.html?out    projector 1 window (also ?out=1)
   project.html?out=2  projector 2 window
   Each window is a black page with the warped image only.

   Method (as on the Gleniff site): the layers are drawn north-up into a square texture in ITM metres. A grid mesh covers
   the square; each vertex is a point on the model at its printed height z (mm above the table). A projector is a point
   (cx, cy, h) above the table, so a raised point lands further out: p' = c + (p − c)·h/(h − z). That table-level point is
   taken to the screen by the homography fixed by four pins on the foot of the model.

   With two projectors, each covers half the model plus an overlap. Across a band in the overlap each projector's image
   fades out while the other fades in. The fade is in light, not in pixel values: a projector's light goes roughly as
   pixel^γ, so a projector with weight w is dimmed to w^(1/γ) and the two halves add up to an even brightness.
   The kiosk sends what to show over the BroadcastChannel; the calibration is kept in this browser's localStorage. */
(async function () {
  'use strict';
  const { $, fmtN, toITM, getJSON, terrain, bus } = AW;
  const OUT = document.documentElement.classList.contains('proj-out');
  const ME = OUT ? (new URLSearchParams(location.search).get('out') === '2' ? 1 : 0) : -1;   // which projector this window drives
  const MJ = await getJSON('data/model.json');
  const [CX, CY] = MJ.centre, R = MJ.radius, [X0, Y0] = MJ.origin, SZ = MJ.size, MSCALE = MJ.scale;   // 1:2500
  const MM = 1000 / MSCALE;                                                                            // model mm per metre
  const KEY = 'aiarg-projector-v2', OLDKEY = 'aiarg-projector-v1';
  const THROW = 1.30, ASPECT = 1.6;                                                                    // Epson EB-W06 at its widest; 16:10

  // ---------------------------------------------------------------- set-ups and their pins
  // 'one': one projector over Lady Erin. 'ns': projector 1 over the north half, 2 over the south half (long side east–west).
  // 'ew': projector 1 over the west half, 2 over the east half, both turned 90°. Pins are compass points on the foot of the model.
  const PINS = {
    one: [[['N', 0], ['E', 90], ['S', 180], ['W', 270]]],
    ns: [[['W', 270], ['NW', 315], ['NE', 45], ['E', 90]], [['E', 90], ['SE', 135], ['SW', 225], ['W', 270]]],
    ew: [[['S', 180], ['SW', 225], ['NW', 315], ['N', 0]], [['N', 0], ['NE', 45], ['SE', 135], ['S', 180]]]
  };
  const RIG0 = {
    one: [{ h: 3600, nx: 0, ny: 0 }],
    ns: [{ h: 2300, nx: 0, ny: 290 }, { h: 2300, nx: 0, ny: -290 }],
    ew: [{ h: 2300, nx: -290, ny: 0 }, { h: 2300, nx: 290, ny: 0 }]
  };
  const pinXY = b => { const a = (90 - b) * Math.PI / 180; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
  // where the pins should land if the projector hangs level over (nx, ny), so the first image is close
  function defPins(m, i, r) {
    const W = r.h / THROW, H = W / ASPECT, [U, V] = m === 'ew' ? [[0, 1], [1, 0]] : [[1, 0], [0, -1]];
    return PINS[m][i].map(([, b]) => {
      const [E, N] = pinXY(b), dx = (E - CX) * MM - r.nx, dy = (N - CY) * MM - r.ny, cl = x => Math.min(.98, Math.max(.02, x));
      return [cl(.5 + (dx * U[0] + dy * U[1]) / W), cl(.5 + (dx * V[0] + dy * V[1]) / H)];
    });
  }
  const freshRig = (m, i) => { const r = Object.assign({}, RIG0[m][i]); r.pins = defPins(m, i, r); return r; };

  // ---------------------------------------------------------------- state
  const S = {
    n: 1, split: 'ns',                      // how many projectors, and how two share the model
    blend: 200, seam: 0, gamma: 2.2,        // fade band width (mm on the model), seam offset (mm north or west of Lady Erin), projector gamma
    rigs: {},                               // per set-up: [{ h, nx, ny, pins }] lens height (mm), lens offset from Lady Erin (mm, +east/+north), pins (screen 0–1)
    base: 9, datum: -3, vex: 1,             // how the tiles were printed: base slab (mm), datum (m OD) and ground exaggeration
    cal: false, test: false, follow: true, bright: 1,
    layers: { roads: true, water: true, areas: false, zoning: false, mon: false, scheme: false, relief: false, grid: false, opw: false, buses: false, traffic: false, sewer: false, watermains: false, cycle: false, planning: false, nature: false, power: false },
    kiosk: null                             // last state from the kiosk
  };
  let edit = 0;                             // the projector the control page is calibrating
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) Object.assign(S, s, { layers: Object.assign({}, S.layers, s.layers) });
    else {                                  // carry over a one-projector calibration from the first version
      const o = JSON.parse(localStorage.getItem(OLDKEY) || 'null');
      if (o) { ['base', 'datum', 'vex', 'follow', 'bright'].forEach(k => { if (k in o) S[k] = o[k]; }); Object.assign(S.layers, o.layers || {}); if (o.pins) S.rigs.one = [{ h: o.h, nx: o.nx, ny: o.ny, pins: o.pins }]; }
    }
  } catch (e) { }
  const mode = () => S.n === 2 ? S.split : 'one';
  function ensure() { Object.keys(PINS).forEach(m => { S.rigs[m] = S.rigs[m] || []; PINS[m].forEach((_, i) => { if (!S.rigs[m][i] || !S.rigs[m][i].pins) S.rigs[m][i] = freshRig(m, i); }); }); }
  ensure();
  const rig = i => S.rigs[mode()][Math.min(i, S.n - 1)];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign({}, S, { kiosk: S.kiosk }))); } catch (e) { } };

  // ---------------------------------------------------------------- data, in ITM
  const T = await terrain('dtm8m');
  const [BJ, AJ, ZJ, RJ, CJ, WJ, FJ] = await Promise.all(['buildings', 'areas', 'zoning', 'roads', 'context', 'water', 'flood'].map(n => getJSON(`data/${n}.json`)));
  const itm = g => { const f = c => typeof c[0] === 'number' ? toITM(c[0], c[1]) : c.map(f); return { type: g.type, coordinates: f(g.coordinates) }; };
  const B = BJ.features.map(f => itm(f.geometry)), A = AJ.features.map(f => ({ g: itm(f.geometry), p: f.properties }));
  const Z = ZJ.features.map(f => ({ g: itm(f.geometry), c: f.properties.colour || '#777' }));
  const RD = RJ.features.map(f => ({ g: itm(f.geometry), c: f.properties.fclass })), MON = CJ.monuments.features.map(f => itm(f.geometry));
  const W = WJ.features.map(f => itm(f.geometry)), F = FJ.features.map(f => ({ g: itm(f.geometry), p: f.properties }));
  const SCH = itm(MJ.scheme);
  const OPW = (await getJSON('data/opw_flood.json')).features.map(f => ({ g: itm(f.geometry), p: { src: 'opw', level: f.properties.aep } }));
  OPW.forEach(o => { o.p.fut = 'now'; F.push(o); });
  (await getJSON('data/opw_future.json').catch(() => ({ features: [] }))).features.forEach(f => F.push({ g: itm(f.geometry), p: f.properties }));
  const BUS = await AW.buses();
  const UT = await AW.utilities();
  const CYC = await AW.cycling();
  const PLN = await AW.planning();
  const NAT = await AW.nature();
  const PWR = await AW.power();
  const TT = AW.traffic; getJSON('exhibition/config.json').then(c => TT.setConfigKey(c.tomtomKey)).catch(() => { });
  const CIRC = MJ.circle.coordinates[0], TBOX = [Math.min(...CIRC.map(c => c[0])), Math.min(...CIRC.map(c => c[1])), Math.max(...CIRC.map(c => c[0])), Math.max(...CIRC.map(c => c[1]))];
  let TR = null, trB = -1, trBusy = false;
  const TY = AW.typicalTraffic, RC = AW.trafficRec, LV = [.3, .6, .8, 1];                                         // without live data: typical traffic on the main roads
  const MAIN = RD.filter(r => TY.W[r.c]).flatMap(r => (r.g.type === 'MultiLineString' ? r.g.coordinates : [r.g.coordinates]).map(cs => {
    const m = cs[cs.length >> 1]; return { c: r.c, cs, d: Math.hypot(m[0] - CX, m[1] - CY) };
  }));                               // the last traffic download and its refresh bucket
  const HS = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = 'data/hillshade.png'; });

  // ---------------------------------------------------------------- the texture: north up, the 4.1 km square
  const TS = 4096, tex = document.createElement('canvas'); tex.width = tex.height = TS;
  const tx = tex.getContext('2d'), k = TS / SZ;
  const P = (E, N) => [(E - X0) * k, (Y0 + SZ - N) * k];
  function path(g) {
    const ring = r => r.forEach(([E, N], i) => { const [x, y] = P(E, N); i ? tx.lineTo(x, y) : tx.moveTo(x, y); });
    if (g.type === 'Polygon') g.coordinates.forEach(r => { ring(r); tx.closePath(); });
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => { ring(r); tx.closePath(); }));
    else if (g.type === 'LineString') ring(g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach(ring);
  }
  const fill = (g, c, a = 1) => { tx.globalAlpha = a; tx.fillStyle = c; tx.beginPath(); path(g); tx.fill('evenodd'); tx.globalAlpha = 1; };
  const RW = { motorway: 12, trunk: 12, trunk_link: 8, primary: 10, primary_link: 7, secondary: 9, secondary_link: 7, tertiary: 8, tertiary_link: 7, residential: 6, unclassified: 6, living_street: 5, pedestrian: 5, service: 4 };
  function compose() {
    const L = S.follow && S.kiosk ? S.kiosk.layers : S.layers, ks = S.follow ? S.kiosk : null;
    tx.setTransform(1, 0, 0, 1, 0, 0); tx.fillStyle = S.test ? '#fff' : '#000'; tx.fillRect(0, 0, TS, TS);
    if (!S.test) {
      if (L.relief && HS) { tx.globalAlpha = .55; tx.drawImage(HS, 0, 0, TS, TS); tx.globalAlpha = 1; }
      if (L.areas && ks) { const cm = Q.areaColours(AJ.features, ks.areaKey || 'pct_ber_e_to_g'); A.forEach(a => { const c = cm.get(a.p[ks.areaKey || 'pct_ber_e_to_g']); if (c) fill(a.g, c, .9); }); }
      if (L.zoning) Z.forEach(z => fill(z.g, z.c, .8));
      if (L.water) W.forEach(g => fill(g, '#1f6fb5'));
      const fl = ks && ks.flood;
      if (L.opw) [1, 5, 10].forEach(a => { const o = OPW.find(x => x.p.level === a); if (o) fill(o.g, Q.C.opwBands[a], .95); });
      if (fl) { const f = F.find(x => x.p.src === fl.src && x.p.level === fl.level && (fl.src !== 'coast' || x.p.rp === fl.rp) && (fl.src !== 'opw' || (x.p.fut || 'now') === (fl.fut || 'now'))); if (f) { fill(f.g, fl.src === 'sea' ? '#3fa9f5' : fl.src === 'lake' ? '#36c6d3' : fl.src === 'coast' ? Q.C.coast : Q.C.opw, .95); tx.strokeStyle = '#d8f1ff'; tx.lineWidth = 3; tx.beginPath(); path(f.g); tx.stroke(); } }
      const trOn = L.traffic && TR && TR.ok && !(ks && ks.busFast);
      if (L.roads) { tx.globalAlpha = L.traffic || L.cycle || L.power ? .3 : 1; tx.strokeStyle = '#ffffff'; tx.lineCap = 'round'; tx.lineJoin = 'round'; RD.forEach(r => { const w = RW[r.c]; if (!w) return; tx.lineWidth = w * k; tx.beginPath(); path(r.g); tx.stroke(); }); tx.globalAlpha = 1; }
      if (trOn) {                                                        // TomTom tiles, each placed by three of its corners
        tx.imageSmoothingEnabled = true;
        TR.tiles.forEach(t => {
          const [ax, ay] = P(...t.nw), [bx, by] = P(...t.ne), [cx2, cy2] = P(...t.sw);
          tx.setTransform((bx - ax) / 256, (by - ay) / 256, (cx2 - ax) / 256, (cy2 - ay) / 256, ax, ay); tx.drawImage(t.img, 0, 0, 256, 256);
        });
        tx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (ks && ks.sel && ks.sel.ids && ks.sel.ids.length) {
        if (ks.sel.tgt === 'b') ks.sel.ids.forEach(i => { const g = B[i]; if (!g) return; fill(g, Q.C.match); tx.strokeStyle = Q.C.match; tx.lineWidth = 2.5; tx.beginPath(); path(g); tx.stroke(); });
        else ks.sel.ids.forEach(i => { const a = A[i]; if (!a) return; fill(a.g, Q.C.match, .45); tx.strokeStyle = Q.C.match; tx.lineWidth = 5; tx.beginPath(); path(a.g); tx.stroke(); });
      }
      if (L.buses) { tx.lineCap = 'round'; tx.lineJoin = 'round'; tx.lineWidth = 7 * k; tx.globalAlpha = .9; BUS.lines.forEach(l => { tx.strokeStyle = BUS.routes[l.r].col; tx.beginPath(); l.x.forEach((x, i) => { const [a, b] = P(x, l.y[i]); i ? tx.lineTo(a, b) : tx.moveTo(a, b); }); tx.stroke(); }); tx.globalAlpha = 1; }
      Object.values(UT).forEach(u => {                                 // underground networks: pipes 3 m wide (1.2 mm), outfalls as rings
        if (!L[u.id]) return;
        u.zones.forEach(z => z.rings.forEach(r => { const g = { type: 'Polygon', coordinates: [r] }; fill(g, AW.SUPPLY[z.src] || '#888', .3); tx.strokeStyle = AW.SUPPLY[z.src] || '#888'; tx.lineWidth = 3 * k; tx.beginPath(); path(g); tx.stroke(); }));
        tx.strokeStyle = u.col; tx.lineWidth = 3 * k; tx.lineCap = 'round'; tx.lineJoin = 'round';
        tx.beginPath(); u.lines.forEach(l => l.xy.forEach(([E, N], i) => { const [a, b] = P(E, N); i ? tx.lineTo(a, b) : tx.moveTo(a, b); })); tx.stroke();
        tx.fillStyle = '#ffffff'; u.tanks.forEach(([E, N]) => { const [a, b] = P(E, N); tx.beginPath(); tx.arc(a, b, 16 * k, 0, 7); tx.fill(); });
        tx.lineWidth = 4 * k; u.points.outfall.forEach(([E, N]) => { const [a, b] = P(E, N); tx.beginPath(); tx.arc(a, b, 14 * k, 0, 7); tx.stroke(); });
      });
      if (L.cycle && CYC) {                                              // cycle routes: 8 m wide (3 mm), tracks 10 m, over dimmed roads; bike parking as dots
        tx.lineCap = 'round'; tx.lineJoin = 'round';
        ['shared', 'lane', 'path', 'track'].forEach(kd => { tx.strokeStyle = AW.CYCLE[kd][0]; tx.lineWidth = (kd === 'track' ? 10 : 8) * k; tx.beginPath(); CYC.lines.forEach(l => { if (l.k !== kd) return; l.xy.forEach(([E, N], i) => { const [a, b] = P(E, N); i ? tx.lineTo(a, b) : tx.moveTo(a, b); }); }); tx.stroke(); });
        tx.fillStyle = '#ffffff'; CYC.parking.forEach(([E, N]) => { const [a, b] = P(E, N); tx.beginPath(); tx.arc(a, b, 6 * k, 0, 7); tx.fill(); });
      }
      if (L.nature && NAT) {                                            // protected sites: SAC filled green, SPA dashed orange, pNHA dotted
        NAT.sites.forEach(st => st.rings.forEach(poly => {
          const g = { type: 'Polygon', coordinates: poly };
          if (st.k === 'sac') { fill(g, AW.NATURE.sac[0], .5); tx.strokeStyle = AW.NATURE.sac[0]; tx.lineWidth = 4 * k; tx.setLineDash([]); }
          else if (st.k === 'spa') { tx.strokeStyle = AW.NATURE.spa[0]; tx.lineWidth = 6 * k; tx.setLineDash([24 * k, 14 * k]); }
          else { tx.strokeStyle = AW.NATURE.pnha[0]; tx.lineWidth = 4 * k; tx.setLineDash([5 * k, 10 * k]); }
          tx.beginPath(); path(g); tx.stroke(); tx.setLineDash([]);
        }));
      }
      if (L.power && PWR) {                                             // electricity: lines by voltage (cables dashed), ESB substations, then points; rings in flood zones
        tx.lineCap = 'round';
        ['unknown', 'lv', 'mv', '38kv', '110kv'].forEach(v => (PWR.lines || []).forEach(l => {
          if (l.v !== v) return; tx.strokeStyle = AW.VOLT[v][0]; tx.lineWidth = (v === '38kv' || v === '110kv' ? 9 : v === 'mv' ? 6.5 : 4.5) * k; tx.setLineDash(l.u ? [8 * k, 8 * k] : []);
          tx.beginPath(); l.xy.forEach(([E, N], i) => { const [a, b] = P(E, N); i ? tx.lineTo(a, b) : tx.moveTo(a, b); }); tx.stroke();
        })); tx.setLineDash([]);
        (PWR.subs || []).forEach(st => { if (st.ring) { fill({ type: 'Polygon', coordinates: [st.ring] }, '#ff5d8f', .9); tx.strokeStyle = '#ffffff'; tx.lineWidth = 3; tx.beginPath(); path({ type: 'Polygon', coordinates: [st.ring] }); tx.stroke(); } });
        const R0 = { sub: 13, tx: 11, gen: 10, pylon: 7, pole: 5 };
        ['pole', 'pylon', 'gen', 'tx', 'sub'].forEach(kd => PWR.pts.forEach(p => {
          if (p.k !== kd) return; const [a, b] = P(p.x, p.y);
          if (p.fz || p.fz1) { tx.fillStyle = p.fz ? '#ff3b30' : '#7aa7ff'; tx.beginPath(); tx.arc(a, b, (R0[kd] + 5) * k, 0, 7); tx.fill(); }
          tx.fillStyle = AW.POWER[kd][0]; tx.beginPath(); tx.arc(a, b, R0[kd] * k, 0, 7); tx.fill();
        }));
      }
      if (L.planning && PLN) {                                          // planning permissions granted up to the kiosk's year; that year's brighter
        const y = ks && ks.planY ? ks.planY : PLN.last, only = !!(ks && ks.planOnly);
        PLN.shown(y, only).forEach(a => {
          const c = AW.PLAN[a.k][0], now = Math.max(a.y, PLN.first) === y;
          if (a.rings) { fill({ type: 'Polygon', coordinates: a.rings }, c, now ? .95 : .55); if (now) { tx.strokeStyle = '#ffffff'; tx.lineWidth = 2.5; tx.beginPath(); path({ type: 'Polygon', coordinates: a.rings }); tx.stroke(); } }
          else { const [px, py] = P(...a.p); tx.globalAlpha = now ? 1 : .6; tx.fillStyle = c; tx.beginPath(); tx.arc(px, py, 10 * k, 0, 7); tx.fill(); tx.globalAlpha = 1; }
        });
      }
      if (L.scheme) fill(SCH, Q.C.scheme);
      if (L.mon) { tx.fillStyle = '#62d39a'; MON.forEach(g => { const [x, y] = P(...g.coordinates); tx.beginPath(); tx.arc(x, y, 12 * k, 0, 7); tx.fill(); }); }
      if (L.grid || S.cal) { tx.strokeStyle = S.cal ? '#ff9a00' : '#f0a54a'; tx.lineWidth = 3; MJ.tiles.forEach(t => { const [x, y] = P(t.x0, t.y0 + 575); tx.strokeRect(x, y, 575 * k, 575 * k); }); }
    }
    // outside the model: black
    const [cx, cy] = P(CX, CY);
    tx.globalCompositeOperation = 'destination-in'; tx.beginPath(); tx.arc(cx, cy, R * k, 0, 7); tx.fill(); tx.globalCompositeOperation = 'source-over';
    if (S.cal) {                                                         // calibration: the rim just inside the edge, Lady Erin, and the seam
      tx.strokeStyle = '#ff9a00'; tx.lineWidth = 8; tx.beginPath(); tx.arc(cx, cy, (R - 12) * k, 0, 7); tx.stroke();
      tx.strokeStyle = '#ff2a2a'; tx.lineWidth = 8; tx.beginPath(); tx.moveTo(cx - 120, cy); tx.lineTo(cx + 120, cy); tx.moveTo(cx, cy - 120); tx.lineTo(cx, cy + 120); tx.stroke();
      tx.beginPath(); tx.arc(cx, cy, 40, 0, 7); tx.stroke();
      if (S.n === 2) {
        const off = S.seam / MM, h = S.blend / MM / 2; tx.setLineDash([30, 24]); tx.lineWidth = 5;
        [[-h, '#36c6d3'], [0, '#ffffff'], [h, '#36c6d3']].forEach(([d, c]) => {
          tx.strokeStyle = c; tx.beginPath();
          if (S.split === 'ns') { const [, y] = P(CX, CY + off + d); tx.moveTo(cx - R * k, y); tx.lineTo(cx + R * k, y); }
          else { const [x] = P(CX - off - d, CY); tx.moveTo(x, cy - R * k); tx.lineTo(x, cy + R * k); }
          tx.stroke();
        });
        tx.setLineDash([]);
      }
    }
    if (S.bright < 1) { tx.fillStyle = `rgba(0,0,0,${1 - S.bright})`; tx.fillRect(0, 0, TS, TS); }
    views.forEach(v => v.texUpdate());
  }

  // ---------------------------------------------------------------- mapping: plan point + height → screen
  function homography(src, dst) {
    const M = [], b = [];
    for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; M.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); M.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    for (let i = 0; i < 8; i++) {
      let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      [M[i], M[p]] = [M[p], M[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < 8; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c < 8; c++) M[r][c] -= f * M[i][c]; b[r] -= f * b[i]; }
    }
    const h = new Array(8); for (let i = 7; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < 8; c++) s -= M[i][c] * h[c]; h[i] = s / M[i][i]; }
    return h.concat(1);
  }
  const applyH = (h, x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
  function mapper(pi, wpx, hpx) {
    const r = rig(pi), pts = PINS[mode()][Math.min(pi, S.n - 1)].map(([, b]) => pinXY(b));
    const Hm = homography(pts, r.pins.map(([u, v]) => [u * wpx, v * hpx]));
    const cx = CX + r.nx / MM, cy = CY + r.ny / MM, hh = Math.max(200, r.h);
    return (E, N, z) => { const s = hh / Math.max(1, hh - z); return applyH(Hm, cx + (E - cx) * s, cy + (N - cy) * s); };
  }
  // the share of the light projector pi gives to a plan point: 1 on its side of the seam, 0 on the other, a smooth fade between
  function weight(pi, E, N) {
    if (S.n === 1) return 1;
    const s = (S.split === 'ns' ? N - CY : CX - E) - S.seam / MM, b = Math.max(1, S.blend) / MM;   // + towards projector 1 (north or west)
    let t = Math.min(1, Math.max(0, s / b + .5)); t = t * t * (3 - 2 * t);
    return pi === 0 ? t : 1 - t;
  }
  const zAt = (E, N) => { if ((E - CX) ** 2 + (N - CY) ** 2 > R * R * 1.002) return 0; const v = T.sampleITM(E, N); return S.base + ((v === v ? v : 0) - S.datum) * MM * S.vex; };

  // ---------------------------------------------------------------- a view: warped mesh, blend mask and handles
  const views = [];
  function View(canvas, overlay, wrap, which) {                // which(): the projector this view shows
    const Rr = new THREE.WebGLRenderer({ canvas, antialias: true }); Rr.setClearColor(0x000000, 1);
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    const t3 = new THREE.CanvasTexture(tex); t3.minFilter = THREE.LinearFilter; t3.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: t3, side: THREE.DoubleSide });
    const NM = 180, NV = (NM + 1) ** 2, g = new THREE.BufferGeometry(), pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), al = new Float32Array(NV), idx = [], zz = new Float32Array(NV);
    for (let j = 0; j <= NM; j++) for (let i = 0; i <= NM; i++) { const q = j * (NM + 1) + i; uv[q * 2] = i / NM; uv[q * 2 + 1] = j / NM; zz[q] = zAt(X0 + i / NM * SZ, Y0 + j / NM * SZ); }
    for (let j = 0; j < NM; j++) for (let i = 0; i < NM; i++) { const a = j * (NM + 1) + i, b = a + 1, c = a + NM + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('a', new THREE.BufferAttribute(al, 1)); g.setIndex(idx);
    t3.flipY = true; scene.add(new THREE.Mesh(g, mat));
    // the blend mask: the same mesh drawn again in black, with alpha 1 − w^(1/γ)
    const mask = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float a; varying float va; void main(){ va = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float va; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, va); }'
    }));
    mask.renderOrder = 1; scene.add(mask);
    const oc = overlay.getContext('2d'); let wpx = 2, hpx = 2, fcur = null, pxm = 1, buses = [], typ = null, typScr = null, flow = [];
    const live = () => which() < S.n;
    function rez() { for (let j = 0; j <= NM; j++) for (let i = 0; i <= NM; i++) zz[j * (NM + 1) + i] = zAt(X0 + i / NM * SZ, Y0 + j / NM * SZ); warp(); }
    function warp() {
      if (!live()) { draw(); return; }
      const pi = which(), f = mapper(pi, wpx, hpx), gi = 1 / Math.max(.5, S.gamma);
      fcur = f; typScr = null; { const z0 = zAt(CX, CY), a = f(CX, CY, z0), b = f(CX + 50, CY, z0); pxm = Math.hypot(b[0] - a[0], b[1] - a[1]) / 50; }
      for (let j = 0; j <= NM; j++) for (let i = 0; i <= NM; i++) {
        const q = j * (NM + 1) + i, E = X0 + i / NM * SZ, N = Y0 + j / NM * SZ, [sx, sy] = f(E, N, zz[q]);
        pos[q * 3] = sx; pos[q * 3 + 1] = sy; al[q] = 1 - Math.pow(weight(pi, E, N), gi);
      }
      mask.visible = S.n === 2;
      g.attributes.position.needsUpdate = true; g.attributes.a.needsUpdate = true; g.computeBoundingSphere(); draw();
    }
    function resize() {
      const r = wrap.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      wpx = Math.max(2, Math.round(r.width * dpr)); hpx = Math.max(2, Math.round(r.height * dpr));
      Rr.setSize(wpx, hpx, false); overlay.width = wpx; overlay.height = hpx;
      cam.left = 0; cam.right = wpx; cam.top = 0; cam.bottom = hpx; cam.updateProjectionMatrix(); warp();
    }
    function draw() { if (live()) Rr.render(scene, cam); else Rr.clear(); handles(); }
    function handles() {
      oc.clearRect(0, 0, wpx, hpx); overlay.style.pointerEvents = S.cal && live() ? 'auto' : 'none';
      const fs = Math.round(Math.max(12, Math.min(wpx, hpx) * .025));
      if (!live()) { oc.fillStyle = '#555'; oc.font = `500 ${fs}px "IBM Plex Mono", monospace`; oc.textAlign = 'center'; oc.fillText(`Projector ${which() + 1} is not used in the one-projector set-up`, wpx / 2, hpx / 2); oc.textAlign = 'start'; return; }
      if (typ && fcur) {                                              // typical traffic: each main road in its colour
        const pi = which();
        if (!typScr) typScr = MAIN.map(m => m.cs.map(([E, N]) => { const [x, y] = fcur(E, N, zAt(E, N)); return [x, y, (E - CX) ** 2 + (N - CY) ** 2 <= R * R && weight(pi, E, N) >= .5]; }));
        oc.globalAlpha = S.bright; oc.lineCap = 'round'; oc.lineJoin = 'round';
        MAIN.forEach((m, i) => {
          const s = typ[i]; if (s < 0) return; const pts = typScr[i]; oc.strokeStyle = TY.colour(s); oc.lineWidth = Math.max(2, (RW[m.c] || 8) * 1.1 * pxm);
          oc.beginPath(); let pen = false;
          for (let j = 1; j < pts.length; j++) { const a = pts[j - 1], b = pts[j]; if (!(a[2] && b[2])) { pen = false; continue; } if (!pen) { oc.moveTo(a[0], a[1]); pen = true; } oc.lineTo(b[0], b[1]); }
          oc.stroke();
        });
        oc.globalAlpha = 1;
      }
      if (flow.length && fcur) {                                      // flow along the pipes: small bright dots moving downstream
        const pi = which(), rad = Math.max(1.5, 3.5 * pxm); oc.globalAlpha = S.bright;
        flow.forEach(([col, pts]) => { oc.fillStyle = col; oc.beginPath(); pts.forEach(([E, N]) => { if ((E - CX) ** 2 + (N - CY) ** 2 > R * R || weight(pi, E, N) < .5) return; const [x, y] = fcur(E, N, zAt(E, N)); oc.moveTo(x + rad, y); oc.arc(x, y, rad, 0, 7); }); oc.fill(); });
        oc.globalAlpha = 1;
      }
      if (buses.length && fcur) {                                     // town buses: a dot 8 mm across on the model (20 m)
        const pi = which(), rad = Math.max(3, 10 * pxm); oc.globalAlpha = S.bright;
        buses.forEach(b => {
          if ((b.E - CX) ** 2 + (b.N - CY) ** 2 > R * R || weight(pi, b.E, b.N) < .5) return;
          const [x, y] = fcur(b.E, b.N, zAt(b.E, b.N)); oc.fillStyle = BUS.routes[b.r].col; oc.beginPath(); oc.arc(x, y, rad, 0, 7); oc.fill();
        });
        oc.globalAlpha = 1;
      }
      if (!S.cal) return;
      const r = Math.max(10, Math.min(wpx, hpx) * .02), lb = PINS[mode()][which()];
      if (S.n === 2) { oc.fillStyle = '#ff9a00'; oc.font = `600 ${fs}px "IBM Plex Mono", monospace`; oc.fillText(`PROJECTOR ${which() + 1}`, r, r + fs); }
      rig(which()).pins.forEach(([u, v], i) => {
        const x = u * wpx, y = v * hpx; oc.strokeStyle = i === sel ? '#ffffff' : '#ff9a00'; oc.lineWidth = Math.max(2, r * .22);
        oc.beginPath(); oc.arc(x, y, r, 0, 7); oc.moveTo(x - r * 1.7, y); oc.lineTo(x + r * 1.7, y); oc.moveTo(x, y - r * 1.7); oc.lineTo(x, y + r * 1.7); oc.stroke();
        oc.fillStyle = oc.strokeStyle; oc.font = `600 ${Math.round(r * 1.2)}px "IBM Plex Mono", monospace`; oc.fillText(lb[i][0], x + r * 1.3, y - r * 1.1);
      });
    }
    let drag = -1, sel = 0;
    overlay.addEventListener('pointerdown', e => {
      if (!S.cal || !live()) return; const b = overlay.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      let best = -1, bd = 1e9; rig(which()).pins.forEach(([u, v], i) => { const d = Math.hypot((u - x) * b.width, (v - y) * b.height); if (d < bd) { bd = d; best = i; } });
      if (bd < 70) { drag = sel = best; overlay.setPointerCapture(e.pointerId); e.preventDefault(); handles(); }
    });
    overlay.addEventListener('pointermove', e => { if (drag < 0) return; const b = overlay.getBoundingClientRect(); rig(which()).pins[drag] = [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; calChanged(); });
    overlay.addEventListener('pointerup', () => { if (drag >= 0) { drag = -1; calChanged(true); } });
    const nudge = (dx, dy) => { if (!live()) return; const p = rig(which()).pins; p[sel] = [p[sel][0] + dx / wpx, p[sel][1] + dy / hpx]; calChanged(true); };
    new ResizeObserver(resize).observe(wrap);
    const v = { warp, rez, draw, nudge, texUpdate() { t3.needsUpdate = true; draw(); }, setBuses(list) { buses = list; handles(); }, setTypical(list) { typ = list; handles(); }, setFlow(list) { flow = list; } };
    views.push(v); return v;
  }

  // ---------------------------------------------------------------- sync between windows and with the kiosk
  let syncT = 0;
  const B2 = bus(onMsg);
  const SHARED = ['n', 'split', 'blend', 'seam', 'gamma', 'rigs', 'base', 'datum', 'vex', 'cal', 'test', 'follow', 'bright', 'layers'];
  const share = () => { const o = {}; SHARED.forEach(k2 => { o[k2] = S[k2]; }); return o; };
  function calChanged(final) { views.forEach(v => v.warp()); if (final) save(); clearTimeout(syncT); syncT = setTimeout(() => B2.send({ t: 'proj', s: share() }), final ? 0 : 30); if (!OUT) showCal(); }
  function changed(geo) { setTimeout(trafficTick, 0); save(); if (geo) views.forEach(v => v.rez()); else views.forEach(v => v.warp()); compose(); B2.send({ t: 'proj', s: share() }); if (!OUT) syncUI(); }
  function onMsg(m) {
    if (m.t === 'kiosk') { S.kiosk = m.s; save(); compose(); trafficTick(); if (!OUT) showKiosk(true); }
    else if (m.t === 'tt-key') { trB = -1; trafficTick(true); if (!OUT) showTraffic(); }
    else if (m.t === 'proj') { const geo = m.s.base !== S.base || m.s.datum !== S.datum || m.s.vex !== S.vex; Object.assign(S, m.s); ensure(); if (OUT) save(); if (geo) views.forEach(v => v.rez()); else views.forEach(v => v.warp()); compose(); if (!OUT) syncUI(); }
    else if (m.t === 'ping' && OUT) B2.send({ t: 'hello', who: 'out', i: ME });
    else if (m.t === 'hello' && m.who === 'out' && !OUT) { outs.add(m.i || 0); link(); B2.send({ t: 'proj', s: share() }); }
    else if (m.t === 'bye' && m.who === 'out' && !OUT) { outs.delete(m.i || 0); link(); }
  }
  const outs = new Set();

  // ---------------------------------------------------------------- town buses, moved from the timetable several times a second
  let hadBuses = false, tyStep = null;
  setInterval(() => {
    const ks = S.follow ? S.kiosk : null, L = ks ? ks.layers : S.layers, on = !!(L && L.buses) && !S.test;
    const c = BUS.clock(!!(ks && ks.busFast)), tyOn = !!(L && L.traffic) && (!(TR && TR.ok) || c.fast) && !S.test;
    const rd = tyOn && c.fast ? (d => d && d.n === MAIN.length ? d : null)(RC.bestDay()) : null, st = tyOn ? TY.step(c) + (c.fast ? 'f' : '') + c.day + (rd ? rd.date : '') : null;
    if (st !== tyStep) { tyStep = st; const lv = rd ? RC.at(rd, c.t) : null; const list = tyOn ? MAIN.map((m, i) => lv && lv[i] >= 0 ? LV[lv[i]] : TY.level(m.c, m.d, c)) : null; views.forEach(v => v.setTypical(list)); }
    const fl = S.test ? [] : Object.values(UT).filter(u => L && L[u.id]).map(u => [u.dot, AW.flowDots(u)]); views.forEach(v => v.setFlow(fl));
    if (!on) { if (hadBuses) { views.forEach(v => v.setBuses([])); hadBuses = false; } views.forEach(v => v.draw && fl.length && v.setBuses([])); return; }
    const list = BUS.at(c); views.forEach(v => v.setBuses(list)); hadBuses = true;
  }, 125);

  // ---------------------------------------------------------------- live traffic, fetched again every few minutes while it is on
  async function trafficTick(force) {
    const ks = S.follow ? S.kiosk : null, L = ks ? ks.layers : S.layers;
    if (!(L && L.traffic) || trBusy || (!force && trB === TT.bucket())) return;
    trBusy = true; trB = TT.bucket();
    try { TR = await TT.load(TBOX); } finally { trBusy = false; }
    compose(); if (!OUT) showTraffic();
  }
  setInterval(trafficTick, 5000);

  // ---------------------------------------------------------------- projector window
  function keys(e, v) {
    if (e.target.matches && e.target.matches('input, select, textarea')) return;
    const kk = e.key.toLowerCase();
    if (kk === 'f') { e.preventDefault(); (OUT ? document.documentElement : $('#pvWrap')).requestFullscreen?.().catch(() => { }); }
    else if (kk === 'c') { S.cal = !S.cal; changed(); }
    else if (!OUT && (kk === '1' || kk === '2') && S.n === 2) { setEdit(+kk - 1); }
    else if (S.cal && e.key.startsWith('Arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; v.nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); }
  }
  if (OUT) {
    document.title = `Projector ${ME + 1} · As Water Arrives`;
    const st = $('#outStage'); st.hidden = false; $('#outHint').textContent = `Projector ${ME + 1} · F full screen · C calibration`;
    const v = View($('#out'), $('#outOv'), st, () => ME);
    compose();
    B2.send({ t: 'hello', who: 'out', i: ME }); B2.send({ t: 'want-kiosk' });
    addEventListener('beforeunload', () => B2.send({ t: 'bye', who: 'out', i: ME }));
    addEventListener('keydown', e => keys(e, v));
    let quiet; const wake = () => { st.classList.remove('quiet'); clearTimeout(quiet); quiet = setTimeout(() => st.classList.add('quiet'), 2500); }; wake(); addEventListener('pointermove', wake);
    return;
  }

  // ---------------------------------------------------------------- control window
  const pv = View($('#pv'), $('#pvOv'), $('#pvWrap'), () => Math.min(edit, S.n - 1));
  addEventListener('keydown', e => keys(e, pv));
  const openOut = i => window.open(i ? 'project.html?out=2' : 'project.html?out', i ? 'aiarg-projector-2' : 'aiarg-projector', 'popup,width=1280,height=800');
  function link() {
    const want = S.n, have = [0, 1].filter(i => outs.has(i) && i < want);
    $('#link').textContent = want === 1 ? (outs.has(0) ? 'Projector window connected' : 'No projector window yet') :
      `Projector 1: ${outs.has(0) ? 'connected' : 'not open'} · Projector 2: ${outs.has(1) ? 'connected' : 'not open'}`;
    $('#link').dataset.on = have.length === want ? '1' : '0';
  }
  $('#openOut').onclick = () => openOut(0);
  $('#openOut2').onclick = () => openOut(1);
  $('#fullHere').onclick = () => $('#pvWrap').requestFullscreen?.().catch(() => { });
  const seg = (sel2, val, fn) => $(sel2).querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.v === String(val))); b.onclick = () => fn(b.dataset.v); });
  function setEdit(i) { edit = i; pv.warp(); syncUI(); }
  // per-projector numbers go to the projector being calibrated; the rest are shared
  const rnum = (id, key) => { const el = $(id); el.onchange = () => { rig(edit)[key] = +el.value; calChanged(true); }; };
  const num = (id, key, geo) => { const el = $(id); el.onchange = () => { S[key] = +el.value; changed(geo); }; };
  rnum('#h', 'h'); rnum('#nx', 'nx'); rnum('#ny', 'ny');
  num('#blend', 'blend'); num('#seam', 'seam'); num('#gamma', 'gamma');
  num('#base', 'base', true); num('#datum', 'datum', true); num('#vex', 'vex', true);
  $('#cal').onchange = e => { S.cal = e.target.checked; changed(); };
  $('#test').onchange = e => { S.test = e.target.checked; changed(); };
  $('#follow').onchange = e => { S.follow = e.target.checked; changed(); showKiosk(); };
  $('#bright').oninput = e => { S.bright = +e.target.value / 100; changed(); };
  $('#resetPins').onclick = () => { const m = mode(), i = Math.min(edit, S.n - 1); S.rigs[m][i] = freshRig(m, i); calChanged(true); syncUI(); };
  const LBL = { roads: 'Roads', water: 'Water today', areas: 'Census areas', zoning: 'Zoning', mon: 'Recorded monuments', scheme: 'Proposed river crossing', relief: 'Shaded relief', grid: 'Tile grid', opw: 'OPW flood maps', buses: 'Town buses (timetable)', traffic: 'Traffic (live with a TomTom key, otherwise typical)', sewer: 'Sewers (2008)', watermains: 'Water mains', cycle: 'Cycle routes', planning: 'Planning permissions', nature: 'Protected nature sites', power: 'Electricity' };
  $('#layers').innerHTML = Object.keys(S.layers).filter(k2 => !(k2 in { sewer: 1, watermains: 1 }) || UT[k2]).map(k2 => `<label class="row"><input type="checkbox" data-l="${k2}"> ${LBL[k2]}</label>`).join('');
  $('#layers').querySelectorAll('[data-l]').forEach(c => c.onchange = () => { S.layers[c.dataset.l] = c.checked; changed(); });
  const STEPS = {
    one: ['Hang the projector pointing straight down over Lady Erin, the centre of the model, with the lens about 3.6 m above the table (Epson EB-W06).',
      'Drag the four pins <b>N, E, S, W</b> onto the points where the round model meets the table.',
      'Measure the lens height above the table. If the red centre cross misses Lady Erin, adjust the offsets.'],
    ns: ['Hang projector 1 over the north half and projector 2 over the south half, both pointing straight down with the long side of the picture east–west, lenses about 2.3 m above the table and about 290 mm either side of Lady Erin.',
      'Open both projector windows and drag each one onto its projector. Calibrate one at a time (keys <b>1</b> and <b>2</b>): projector 1 uses pins <b>W, NW, NE, E</b>; projector 2 uses <b>E, SE, SW, W</b>, all on the foot of the model.',
      'Enter each lens height and its offset from Lady Erin. Both red crosses should land on Lady Erin.',
      'Tick <b>White test</b> and adjust the gamma until the band between the dashed lines is as bright as the rest. Move the seam off a busy street if you like.'],
    ew: ['Hang projector 1 over the west half and projector 2 over the east half, both pointing straight down and turned 90°, so the long side of each picture runs north–south. Lenses about 2.3 m above the table, about 290 mm either side of Lady Erin.',
      'Open both projector windows and drag each one onto its projector. Calibrate one at a time (keys <b>1</b> and <b>2</b>): projector 1 uses pins <b>S, SW, NW, N</b>; projector 2 uses <b>N, NE, SE, S</b>, all on the foot of the model.',
      'Enter each lens height and its offset from Lady Erin. Both red crosses should land on Lady Erin.',
      'Tick <b>White test</b> and adjust the gamma until the band between the dashed lines is as bright as the rest. Move the seam off a busy street if you like.']
  };
  function syncUI() {
    const two = S.n === 2, m = mode(), pi = Math.min(edit, S.n - 1), r = rig(pi);
    seg('#nProj', S.n, v => { S.n = +v; if (S.n === 1) edit = 0; changed(); link(); });
    seg('#split', S.split, v => { S.split = v; changed(); });
    seg('#editP', pi, v => setEdit(+v));
    document.querySelectorAll('[data-two]').forEach(el => { el.hidden = !two; });
    $('#openOut').textContent = two ? 'Open projector 1 window' : 'Open projector window';
    [['h', r.h], ['nx', r.nx], ['ny', r.ny], ['blend', S.blend], ['seam', S.seam], ['gamma', S.gamma], ['base', S.base], ['datum', S.datum], ['vex', S.vex]]
      .forEach(([id, v]) => { if (document.activeElement !== $('#' + id)) $('#' + id).value = v; });
    $('#seamLbl').firstChild.textContent = S.split === 'ns' ? 'Seam, mm north of Lady Erin' : 'Seam, mm west of Lady Erin';
    $('#calWho').textContent = two ? `Projector ${pi + 1}` : 'The projector';
    $('#steps').innerHTML = STEPS[m].map(s => `<li>${s}</li>`).join('');
    $('#cal').checked = S.cal; $('#test').checked = S.test; $('#follow').checked = S.follow; $('#bright').value = Math.round(S.bright * 100);
    $('#layers').querySelectorAll('[data-l]').forEach(c => { c.checked = !!S.layers[c.dataset.l]; c.disabled = S.follow && !!S.kiosk; });
    showCal(); link();
  }
  function showCal() { const pi = Math.min(edit, S.n - 1), lb = PINS[mode()][pi]; $('#pinsOut').textContent = rig(pi).pins.map((p, i) => lb[i][0] + ' ' + p.map(x => (x * 100).toFixed(1)).join(', ')).join(' · '); }
  function showKiosk(live) {
    const k2 = S.kiosk;
    $('#kioskState').innerHTML = !k2 ? 'No message from the kiosk yet. Open <a href="kiosk.html" target="_blank">kiosk.html</a> in this browser.' :
      `${live ? '<b>Live:</b> ' : 'Last: '}${k2.flood ? (k2.flood.src === 'opw' ? `OPW river flood map${k2.flood.fut && k2.flood.fut !== 'now' ? ' (' + (k2.flood.fut === 'm' ? 'mid-range' : 'high-end') + ' future)' : ''}, ${k2.flood.level}% a year · ` : k2.flood.src === 'coast' ? `OPW sea ${k2.flood.level ? '+' + k2.flood.level + ' m' : 'today'}, 1 in ${k2.flood.rp} years · ` : `${k2.flood.src === 'sea' ? 'sea' : 'Lough Gill'} at ${fmtN(k2.flood.level, 1)} m OD · `) : ''}${fmtN(k2.sel?.ids?.length || 0)} ${k2.sel?.tgt === 'a' ? 'census areas' : 'buildings'} lit`;
  }
  function showTraffic() {
    const el = $('#ttState'); if (!el) return;
    el.textContent = !TT.key() ? 'No key: the Traffic layer shows typical traffic (modelled, not live).' : !TR ? 'Key saved. Traffic loads when the layer is on.' :
      TR.ok ? `Working: ${TR.tiles.length} tiles, updated ${new Date(TR.when).toTimeString().slice(0, 5)}.` : 'Not working: ' + TT.why[TR.why] + (TR.status ? ` (HTTP ${TR.status})` : '') + '. Press Test key for TomTom\'s own message.';
  }
  $('#ttSave').onclick = () => { TT.setKey($('#ttKey').value); $('#ttKey').value = ''; B2.send({ t: 'tt-key' }); trB = -1; TR = null; trafficTick(true); showTraffic(); };
  $('#ttTest').onclick = async () => { $('#ttState').textContent = 'Asking TomTom…'; const r = await TT.test(); $('#ttState').textContent = r.msg; if (r.ok) { B2.send({ t: 'tt-key' }); trB = -1; TR = null; trafficTick(true); } };
  $('#ttClear').onclick = () => { TT.setKey(''); B2.send({ t: 'tt-key' }); TR = null; compose(); showTraffic(); };
  compose(); syncUI(); showKiosk(); showTraffic();
  B2.send({ t: 'ping' }); B2.send({ t: 'want-kiosk' });
})().catch(e => { console.error(e); const el = document.getElementById('err'); if (el) { el.hidden = false; el.textContent = 'The projection page could not start: ' + e.message; } });
