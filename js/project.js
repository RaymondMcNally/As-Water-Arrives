/* Projection onto the round 1:2500 Sligo model. One script, two windows:
   project.html      controls, calibration and a preview
   project.html?out  the projector window (black page, the warped image only)

   Method (as on the Gleniff site): the layers are drawn north-up into a square texture in ITM metres. A grid mesh covers
   the square; each vertex is a point on the model at its printed height z (mm above the table). The projector is a point
   (cx, cy, h) above the table, so a raised point lands further out: p' = c + (p − c)·h/(h − z). That table-level point is
   taken to the screen by the homography fixed by four pins, set on the foot of the model at north, east, south and west.
   The kiosk sends what to show over the BroadcastChannel; the calibration is kept in this browser's localStorage. */
(async function () {
  'use strict';
  const { $, esc, fmtN, toITM, getJSON, terrain, bus } = AW;
  const OUT = document.documentElement.classList.contains('proj-out');
  const MJ = await getJSON('data/model.json');
  const [CX, CY] = MJ.centre, R = MJ.radius, [X0, Y0] = MJ.origin, SZ = MJ.size, MSCALE = MJ.scale;   // 1:2500
  const MM = 1000 / MSCALE;                                                                            // model mm per metre
  const KEY = 'aiarg-projector-v1';

  // ---------------------------------------------------------------- state
  const S = {
    h: 1700, nx: 0, ny: 0,                  // lens height above the table (mm); projector offset from the model centre (mm on the table, +east/+north)
    base: 9, datum: -3, vex: 1,             // how the tiles were printed: base slab (mm), datum (m OD) and ground exaggeration
    pins: null,                             // screen u, v (0–1) of N, E, S, W pins
    cal: false, follow: true, bright: 1,
    layers: { roads: true, water: true, areas: false, zoning: false, mon: false, scheme: false, relief: false, grid: false, opw: false },
    kiosk: null                             // last state from the kiosk
  };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { Object.assign(S, s, { layers: Object.assign({}, S.layers, s.layers) }); } } catch (e) { }
  if (!S.pins) S.pins = [[.5, .06], [.5 + .44 / 1.6, .5], [.5, .94], [.5 - .44 / 1.6, .5]];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

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
  OPW.forEach(o => F.push(o));
  const HS = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = 'data/hillshade.png'; });
  const SA = {}; A.forEach((a, i) => { SA[a.p.sa_pub2022] = i; });

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
    tx.setTransform(1, 0, 0, 1, 0, 0); tx.fillStyle = '#000'; tx.fillRect(0, 0, TS, TS);
    if (L.relief && HS) { tx.globalAlpha = .55; tx.drawImage(HS, 0, 0, TS, TS); tx.globalAlpha = 1; }
    if (L.areas && ks) { const cm = Q.areaColours(AJ.features, ks.areaKey || 'pct_ber_e_to_g'); A.forEach(a => { const c = cm.get(a.p[ks.areaKey || 'pct_ber_e_to_g']); if (c) fill(a.g, c, .9); }); }
    if (L.zoning) Z.forEach(z => fill(z.g, z.c, .8));
    if (L.water) W.forEach(g => fill(g, '#1f6fb5'));
    const fl = ks && ks.flood;
    if (L.opw) [1, 5, 10].forEach(a => { const o = OPW.find(x => x.p.level === a); if (o) fill(o.g, Q.C.opwBands[a], .95); });
    if (fl) { const f = F.find(x => x.p.src === fl.src && x.p.level === fl.level); if (f) { fill(f.g, fl.src === 'sea' ? '#3fa9f5' : fl.src === 'lake' ? '#36c6d3' : Q.C.opw, .95); tx.strokeStyle = '#d8f1ff'; tx.lineWidth = 3; tx.beginPath(); path(f.g); tx.stroke(); } }
    if (L.roads) { tx.strokeStyle = '#ffffff'; tx.lineCap = 'round'; tx.lineJoin = 'round'; RD.forEach(r => { const w = RW[r.c]; if (!w) return; tx.lineWidth = w * k; tx.beginPath(); path(r.g); tx.stroke(); }); }
    if (ks && ks.sel && ks.sel.ids && ks.sel.ids.length) {
      if (ks.sel.tgt === 'b') ks.sel.ids.forEach(i => { const g = B[i]; if (!g) return; fill(g, Q.C.match); tx.strokeStyle = Q.C.match; tx.lineWidth = 2.5; tx.beginPath(); path(g); tx.stroke(); });
      else ks.sel.ids.forEach(i => { const a = A[i]; if (!a) return; fill(a.g, Q.C.match, .45); tx.strokeStyle = Q.C.match; tx.lineWidth = 5; tx.beginPath(); path(a.g); tx.stroke(); });
    }
    if (L.scheme) fill(SCH, Q.C.scheme);
    if (L.mon) { tx.fillStyle = '#62d39a'; MON.forEach(g => { const [x, y] = P(...g.coordinates); tx.beginPath(); tx.arc(x, y, 12 * k, 0, 7); tx.fill(); }); }
    if (L.grid) { tx.strokeStyle = '#f0a54a'; tx.lineWidth = 3; MJ.tiles.forEach(t => { const [x, y] = P(t.x0, t.y0 + 575); tx.strokeRect(x, y, 575 * k, 575 * k); }); }
    if (S.cal) { tx.strokeStyle = '#ff9a00'; tx.lineWidth = 3; MJ.tiles.forEach(t => { const [x, y] = P(t.x0, t.y0 + 575); tx.strokeRect(x, y, 575 * k, 575 * k); }); }
    // outside the model: black
    const [cx, cy] = P(CX, CY);
    tx.globalCompositeOperation = 'destination-in'; tx.beginPath(); tx.arc(cx, cy, R * k, 0, 7); tx.fill(); tx.globalCompositeOperation = 'source-over';
    if (S.cal) {                                                         // calibration: the rim just inside the edge, and Lady Erin
      tx.strokeStyle = '#ff9a00'; tx.lineWidth = 8; tx.beginPath(); tx.arc(cx, cy, (R - 12) * k, 0, 7); tx.stroke();
      tx.strokeStyle = '#ff2a2a'; tx.lineWidth = 8; tx.beginPath(); tx.moveTo(cx - 120, cy); tx.lineTo(cx + 120, cy); tx.moveTo(cx, cy - 120); tx.lineTo(cx, cy + 120); tx.stroke();
      tx.beginPath(); tx.arc(cx, cy, 40, 0, 7); tx.stroke();
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
  const PINS = [[CX, CY + R], [CX + R, CY], [CX, CY - R], [CX - R, CY]];       // N, E, S, W at the foot of the model
  function mapper(wpx, hpx) {
    const Hm = homography(PINS, S.pins.map(([u, v]) => [u * wpx, v * hpx]));
    const cx = CX + S.nx / MM, cy = CY + S.ny / MM, hh = Math.max(200, S.h);
    return (E, N, z) => { const s = hh / Math.max(1, hh - z); return applyH(Hm, cx + (E - cx) * s, cy + (N - cy) * s); };
  }
  const zAt = (E, N) => { if ((E - CX) ** 2 + (N - CY) ** 2 > R * R * 1.002) return 0; const v = T.sampleITM(E, N); return S.base + ((v === v ? v : 0) - S.datum) * MM * S.vex; };

  // ---------------------------------------------------------------- a view: warped mesh + handles
  const views = [];
  function View(canvas, overlay, wrap) {
    const Rr = new THREE.WebGLRenderer({ canvas, antialias: true }); Rr.setClearColor(0x000000, 1);
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    const t3 = new THREE.CanvasTexture(tex); t3.minFilter = THREE.LinearFilter; t3.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: t3, side: THREE.DoubleSide });
    const NM = 180, g = new THREE.BufferGeometry(), pos = new Float32Array((NM + 1) ** 2 * 3), uv = new Float32Array((NM + 1) ** 2 * 2), idx = [], zz = new Float32Array((NM + 1) ** 2);
    for (let j = 0; j <= NM; j++) for (let i = 0; i <= NM; i++) { const q = j * (NM + 1) + i; uv[q * 2] = i / NM; uv[q * 2 + 1] = j / NM; zz[q] = zAt(X0 + i / NM * SZ, Y0 + j / NM * SZ); }
    for (let j = 0; j < NM; j++) for (let i = 0; i < NM; i++) { const a = j * (NM + 1) + i, b = a + 1, c = a + NM + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    t3.flipY = true; scene.add(new THREE.Mesh(g, mat));
    const oc = overlay.getContext('2d'); let wpx = 2, hpx = 2;
    function rez() { for (let j = 0; j <= NM; j++) for (let i = 0; i <= NM; i++) zz[j * (NM + 1) + i] = zAt(X0 + i / NM * SZ, Y0 + j / NM * SZ); warp(); }
    function warp() {
      const f = mapper(wpx, hpx);
      for (let j = 0; j <= NM; j++) for (let i = 0; i <= NM; i++) { const q = j * (NM + 1) + i, [sx, sy] = f(X0 + i / NM * SZ, Y0 + j / NM * SZ, zz[q]); pos[q * 3] = sx; pos[q * 3 + 1] = sy; }
      g.attributes.position.needsUpdate = true; g.computeBoundingSphere(); draw();
    }
    function resize() {
      const r = wrap.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      wpx = Math.max(2, Math.round(r.width * dpr)); hpx = Math.max(2, Math.round(r.height * dpr));
      Rr.setSize(wpx, hpx, false); overlay.width = wpx; overlay.height = hpx;
      cam.left = 0; cam.right = wpx; cam.top = 0; cam.bottom = hpx; cam.updateProjectionMatrix(); warp();
    }
    function draw() { Rr.render(scene, cam); handles(); }
    function handles() {
      oc.clearRect(0, 0, wpx, hpx); overlay.style.pointerEvents = S.cal ? 'auto' : 'none'; if (!S.cal) return;
      const r = Math.max(10, Math.min(wpx, hpx) * .02);
      S.pins.forEach(([u, v], i) => {
        const x = u * wpx, y = v * hpx; oc.strokeStyle = i === sel ? '#ffffff' : '#ff9a00'; oc.lineWidth = Math.max(2, r * .22);
        oc.beginPath(); oc.arc(x, y, r, 0, 7); oc.moveTo(x - r * 1.7, y); oc.lineTo(x + r * 1.7, y); oc.moveTo(x, y - r * 1.7); oc.lineTo(x, y + r * 1.7); oc.stroke();
        oc.fillStyle = oc.strokeStyle; oc.font = `600 ${Math.round(r * 1.2)}px "IBM Plex Mono", monospace`; oc.fillText('NESW'[i], x + r * 1.3, y - r * 1.1);
      });
    }
    let drag = -1, sel = 0;
    overlay.addEventListener('pointerdown', e => {
      if (!S.cal) return; const b = overlay.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      let best = -1, bd = 1e9; S.pins.forEach(([u, v], i) => { const d = Math.hypot((u - x) * b.width, (v - y) * b.height); if (d < bd) { bd = d; best = i; } });
      if (bd < 70) { drag = sel = best; overlay.setPointerCapture(e.pointerId); e.preventDefault(); handles(); }
    });
    overlay.addEventListener('pointermove', e => { if (drag < 0) return; const b = overlay.getBoundingClientRect(); S.pins[drag] = [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; calChanged(); });
    overlay.addEventListener('pointerup', () => { if (drag >= 0) { drag = -1; calChanged(true); } });
    const nudge = (dx, dy) => { S.pins[sel] = [S.pins[sel][0] + dx / wpx, S.pins[sel][1] + dy / hpx]; calChanged(true); };
    new ResizeObserver(resize).observe(wrap);
    const v = { warp, rez, draw, nudge, texUpdate() { t3.needsUpdate = true; draw(); } };
    views.push(v); return v;
  }

  // ---------------------------------------------------------------- sync between windows and with the kiosk
  let syncT = 0;
  const B2 = bus(onMsg);
  const share = () => ({ h: S.h, nx: S.nx, ny: S.ny, base: S.base, datum: S.datum, vex: S.vex, pins: S.pins, cal: S.cal, follow: S.follow, bright: S.bright, layers: S.layers });
  function calChanged(final) { views.forEach(v => v.warp()); if (final) save(); clearTimeout(syncT); syncT = setTimeout(() => B2.send({ t: 'proj', s: share() }), final ? 0 : 30); if (!OUT) showCal(); }
  function changed(geo) { save(); if (geo) views.forEach(v => v.rez()); compose(); B2.send({ t: 'proj', s: share() }); if (!OUT) syncUI(); }
  function onMsg(m) {
    if (m.t === 'kiosk') { S.kiosk = m.s; save(); compose(); if (!OUT) showKiosk(true); }
    else if (m.t === 'proj') { const geo = m.s.base !== S.base || m.s.datum !== S.datum || m.s.vex !== S.vex; Object.assign(S, m.s); if (geo) views.forEach(v => v.rez()); else views.forEach(v => v.warp()); compose(); if (!OUT) syncUI(); }
    else if (m.t === 'ping' && OUT) B2.send({ t: 'hello', who: 'out' });
    else if (m.t === 'hello' && m.who === 'out' && !OUT) { link(true); B2.send({ t: 'proj', s: share() }); }
    else if (m.t === 'bye' && m.who === 'out' && !OUT) link(false);
  }

  // ---------------------------------------------------------------- projector window
  if (OUT) {
    const st = $('#outStage'); st.hidden = false;
    const v = View($('#out'), $('#outOv'), st);
    compose();
    B2.send({ t: 'hello', who: 'out' }); B2.send({ t: 'want-kiosk' });
    addEventListener('beforeunload', () => B2.send({ t: 'bye', who: 'out' }));
    addEventListener('keydown', e => keys(e, v));
    let quiet; const wake = () => { st.classList.remove('quiet'); clearTimeout(quiet); quiet = setTimeout(() => st.classList.add('quiet'), 2500); }; wake(); addEventListener('pointermove', wake);
    return;
  }
  function keys(e, v) {
    if (e.target.matches && e.target.matches('input, select, textarea')) return;
    const kk = e.key.toLowerCase();
    if (kk === 'f') { e.preventDefault(); (OUT ? document.documentElement : $('#pvWrap')).requestFullscreen?.().catch(() => { }); }
    else if (kk === 'c') { S.cal = !S.cal; changed(); views.forEach(x => x.draw()); }
    else if (S.cal && e.key.startsWith('Arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; v.nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); }
  }

  // ---------------------------------------------------------------- control window
  const pv = View($('#pv'), $('#pvOv'), $('#pvWrap'));
  addEventListener('keydown', e => keys(e, pv));
  const link = on => { $('#link').textContent = on ? 'Projector window connected' : 'No projector window yet'; $('#link').dataset.on = on ? '1' : '0'; };
  $('#openOut').onclick = () => window.open('project.html?out', 'aiarg-projector', 'popup,width=1280,height=800');
  $('#fullHere').onclick = () => $('#pvWrap').requestFullscreen?.().catch(() => { });
  const num = (id, key, geo) => { const el = $(id); el.value = S[key]; el.onchange = () => { S[key] = +el.value; changed(geo); if (!geo) calChanged(true); }; };
  num('#h', 'h'); num('#nx', 'nx'); num('#ny', 'ny'); num('#base', 'base', true); num('#datum', 'datum', true); num('#vex', 'vex', true);
  $('#cal').onchange = e => { S.cal = e.target.checked; changed(); };
  $('#follow').onchange = e => { S.follow = e.target.checked; changed(); showKiosk(); };
  $('#bright').oninput = e => { S.bright = +e.target.value / 100; changed(); };
  $('#resetPins').onclick = () => { S.pins = [[.5, .06], [.5 + .44 / 1.6, .5], [.5, .94], [.5 - .44 / 1.6, .5]]; calChanged(true); };
  const LBL = { roads: 'Roads', water: 'Water today', areas: 'Census areas', zoning: 'Zoning', mon: 'Recorded monuments', scheme: 'Proposed river crossing', relief: 'Shaded relief', grid: 'Tile grid', opw: 'OPW flood maps' };
  $('#layers').innerHTML = Object.keys(S.layers).map(k => `<label class="row"><input type="checkbox" data-l="${k}"> ${LBL[k]}</label>`).join('');
  $('#layers').querySelectorAll('[data-l]').forEach(c => c.onchange = () => { S.layers[c.dataset.l] = c.checked; changed(); });
  function syncUI() {
    ['h', 'nx', 'ny', 'base', 'datum', 'vex'].forEach(k2 => { if (document.activeElement !== $('#' + k2)) $('#' + k2).value = S[k2]; });
    $('#cal').checked = S.cal; $('#follow').checked = S.follow; $('#bright').value = Math.round(S.bright * 100);
    $('#layers').querySelectorAll('[data-l]').forEach(c => { c.checked = !!S.layers[c.dataset.l]; c.disabled = S.follow && !!S.kiosk; });
    showCal();
  }
  function showCal() { $('#pinsOut').textContent = S.pins.map((p, i) => 'NESW'[i] + ' ' + p.map(x => (x * 100).toFixed(1)).join(', ')).join(' · '); }
  function showKiosk(live) {
    const k2 = S.kiosk;
    $('#kioskState').innerHTML = !k2 ? 'No message from the kiosk yet. Open <a href="kiosk.html" target="_blank">kiosk.html</a> in this browser.' :
      `${live ? '<b>Live:</b> ' : 'Last: '}${k2.flood ? (k2.flood.src === 'opw' ? `OPW river flood map, ${k2.flood.level}% a year · ` : `${k2.flood.src === 'sea' ? 'sea' : 'Lough Gill'} at ${fmtN(k2.flood.level, 1)} m OD · `) : ''}${fmtN(k2.sel?.ids?.length || 0)} ${k2.sel?.tgt === 'a' ? 'census areas' : 'buildings'} lit`;
  }
  compose(); syncUI(); showKiosk(); link(false);
  B2.send({ t: 'ping' }); B2.send({ t: 'want-kiosk' });
})().catch(e => { console.error(e); const el = document.getElementById('err'); if (el) { el.hidden = false; el.textContent = 'The projection page could not start: ' + e.message; } });
