/* Make a model: a square of the borough as a 3D-print tile, a laser contour kit or a contour map. */
(async function () {
  'use strict';
  const { $, esc, fmtN, toITM, fromITM, getJSON, terrain, download } = AW;
  const st = (t, err) => { $('#status').textContent = t; $('#status').classList.toggle('err', !!err); };
  st('Loading the ground, buildings, roads and water…');
  const [MJ, T, BLD, RDS, WAT, SCH, GB, GR] = await Promise.all([getJSON('data/model.json'), terrain('dtm2m'), getJSON('data/model/buildings.json'), getJSON('data/model/roads.json'),
    getJSON('data/model/water.json'), getJSON('data/model/scheme.json'), getJSON('data/buildings.json'), getJSON('data/roads.json')]);
  const [X0, Y0] = MJ.origin, SZ = MJ.size, [CX, CY] = MJ.centre, R = MJ.radius;
  const D = { sample: (x, y) => T.sample(x, y) };                               // local metres from the SW corner of the data square

  // ---------------------------------------------------------------- products
  const PROD = {
    print: { scales: [500, 1000, 2500], sizes: [[230, '230 mm (full P1S tile)'], [200, '200 mm'], [150, '150 mm']], note: 'A watertight 3MF for Bambu Studio: ground, roads cut in, water recessed and every building as its footprint.' },
    laser: { scales: [1000, 2500, 500], sizes: [[300, '300 mm'], [200, '200 mm'], [400, '400 mm']], note: 'Contour layers nested on sheets, cut lines red and engraving blue, as SVG and DXF, with a contour plan to build from.' },
    map: { scales: [1000, 1250, 2500], sizes: [[267, 'A3 landscape'], [564, 'A1 landscape']], note: 'A contour plan with buildings, roads and water, a grid in ITM, scale bar and north point, as PDF and SVG.' }
  };
  const S = { p: 'print', scale: 500, size: 230, x0: CX - X0 - 57.5, y0: CY - Y0 - 57.5 };
  const ground = () => S.size / 1000 * S.scale;                                 // metres across

  // ---------------------------------------------------------------- map with the square
  const [cLon, cLat] = fromITM(CX, CY);
  const corners = [[X0, Y0 + SZ], [X0 + SZ, Y0 + SZ], [X0 + SZ, Y0], [X0, Y0]].map(([e, n]) => fromITM(e, n));
  const map = new maplibregl.Map({ container: 'map', attributionControl: false, center: [cLon, cLat], zoom: 14, maxPitch: 0, dragRotate: false,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b1d24' } }] } });
  map.touchZoomRotate.disableRotation();
  await new Promise(r => map.on('load', r));
  map.addSource('hs', { type: 'image', url: 'data/hillshade.png', coordinates: corners });
  map.addLayer({ id: 'hs', type: 'raster', source: 'hs', paint: { 'raster-opacity': .9 } });
  map.addSource('r', { type: 'geojson', data: GR }); map.addLayer({ id: 'r', type: 'line', source: 'r', paint: { 'line-color': '#ffffff', 'line-opacity': .55, 'line-width': 1 } });
  map.addSource('b', { type: 'geojson', data: GB }); map.addLayer({ id: 'b', type: 'fill', source: 'b', paint: { 'fill-color': '#0b1d24', 'fill-opacity': .75 } });
  map.addSource('ring', { type: 'geojson', data: { type: 'Feature', geometry: MJ.circle } }); map.addLayer({ id: 'ring', type: 'line', source: 'ring', paint: { 'line-color': '#f0a54a', 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  map.addSource('sq', { type: 'geojson', data: sqGeo() });
  map.addLayer({ id: 'sq', type: 'fill', source: 'sq', paint: { 'fill-color': '#f0a54a', 'fill-opacity': .18 } });
  map.addLayer({ id: 'sq-l', type: 'line', source: 'sq', paint: { 'line-color': '#f0a54a', 'line-width': 2.5 } });
  function sqGeo() {
    const g = ground(), a = [[S.x0, S.y0], [S.x0 + g, S.y0], [S.x0 + g, S.y0 + g], [S.x0, S.y0 + g], [S.x0, S.y0]].map(([x, y]) => fromITM(X0 + x, Y0 + y));
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [a] } };
  }
  function clampSq() { const g = ground(); S.x0 = Math.max(0, Math.min(SZ - g, S.x0)); S.y0 = Math.max(0, Math.min(SZ - g, S.y0)); }
  function showSq(fit) {
    clampSq(); map.getSource('sq').setData(sqGeo());
    const g = ground(), E = X0 + S.x0, N = Y0 + S.y0;
    $('#extent').textContent = `${S.size} mm at 1:${fmtN(S.scale)} = ${fmtN(g)} m square · SW corner E ${fmtN(E)} N ${fmtN(N)}`;
    $('#where').textContent = 'Drag the square';
    if (fit) { const c = sqGeo().geometry.coordinates[0]; map.fitBounds([c[0], c[2]], { padding: 90, duration: 600, maxZoom: 17 }); }
  }
  // drag the square
  let drag = null;
  const down = e => { const f = map.queryRenderedFeatures(e.point, { layers: ['sq'] }); if (!f.length) return; e.preventDefault(); const [E, N] = toITM(e.lngLat.lng, e.lngLat.lat); drag = { E, N, x0: S.x0, y0: S.y0 }; map.dragPan.disable(); map.getCanvas().style.cursor = 'grabbing'; };
  const move = e => { if (!drag) { map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ['sq'] }).length ? 'grab' : ''; return; } const [E, N] = toITM(e.lngLat.lng, e.lngLat.lat); S.x0 = drag.x0 + E - drag.E; S.y0 = drag.y0 + N - drag.N; showSq(); };
  const up = () => { if (!drag) return; drag = null; map.dragPan.enable(); map.getCanvas().style.cursor = ''; save(); };
  map.on('mousedown', down); map.on('touchstart', e => { if (e.points.length === 1) down(e); }); map.on('mousemove', move); map.on('touchmove', move); map.on('mouseup', up); map.on('touchend', up);
  map.on('dblclick', e => { e.preventDefault(); const [E, N] = toITM(e.lngLat.lng, e.lngLat.lat); const g = ground(); S.x0 = E - X0 - g / 2; S.y0 = N - Y0 - g / 2; showSq(); save(); });

  // ---------------------------------------------------------------- controls
  const save = () => { try { localStorage.setItem('aiarg-model', JSON.stringify(S)); } catch (e) { } };
  try { Object.assign(S, JSON.parse(localStorage.getItem('aiarg-model') || '{}')); } catch (e) { }
  function product(p) {
    S.p = p; const P = PROD[p];
    document.querySelectorAll('[data-p]').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
    document.querySelectorAll('[data-for]').forEach(g => { g.hidden = g.dataset.for !== p; });
    $('#scale').innerHTML = P.scales.map(s => `<option value="${s}">1:${fmtN(s)}</option>`).join('');
    $('#size').innerHTML = P.sizes.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    if (!P.scales.includes(+S.scale)) S.scale = P.scales[0]; if (!P.sizes.some(([v]) => v === +S.size)) S.size = P.sizes[0][0];
    $('#scale').value = S.scale; $('#size').value = S.size; $('#pNote').textContent = P.note;
    $('#sizeRow').firstChild.textContent = p === 'map' ? 'Paper ' : 'Size ';
    showSq(true); save(); $('#dl').innerHTML = ''; st('');
  }
  document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => product(b.dataset.p));
  $('#scale').onchange = e => { const c = [S.x0 + ground() / 2, S.y0 + ground() / 2]; S.scale = +e.target.value; S.x0 = c[0] - ground() / 2; S.y0 = c[1] - ground() / 2; showSq(true); save(); };
  $('#size').onchange = e => { const c = [S.x0 + ground() / 2, S.y0 + ground() / 2]; S.size = +e.target.value; S.x0 = c[0] - ground() / 2; S.y0 = c[1] - ground() / 2; showSq(true); save(); };
  product(S.p);

  const prog = (t, f) => { st(t); $('#prog').hidden = f == null; $('#prog i').style.width = Math.round((f || 0) * 100) + '%'; };
  const tag = () => `Sligo_${Math.round(X0 + S.x0)}_${Math.round(Y0 + S.y0)}_1-${S.scale}`;
  const link = (name, blob, label) => { const a = document.createElement('a'); a.className = 'btn sm'; a.href = URL.createObjectURL(blob); a.download = name; a.textContent = label; $('#dl').append(a); };
  const inBox = (polys, x0, y0, g) => polys.every(p => p[0].every(([x, y]) => x >= x0 && y >= y0 && x <= x0 + g && y <= y0 + g));

  // ---------------------------------------------------------------- 3D print
  async function makePrint() {
    const m = await Print3D.build({ x0: S.x0, y0: S.y0, size: ground(), scale: S.scale, vex: +$('#vex').value, roads: $('#roads').checked, scheme: $('#scheme').checked, base: 5,
      sample: D.sample, data: { buildings: BLD, roads: RDS, water: WAT, scheme: SCH } }, (t, f) => prog(t, f));
    const meta = { Title: `Sligo 1:${S.scale} ${tag()}`, Designer: 'As Water Arrives · A-IARG 2027 · ATU Sligo', Description: `ITM SW corner ${Math.round(X0 + S.x0)}, ${Math.round(Y0 + S.y0)}; datum ${m.info.datum} m OD; ground ×${$('#vex').value}` };
    const zip = new JSZip(); Object.entries(MyModel.print3MFParts(m, meta)).forEach(([k, v]) => zip.file(k, v));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    $('#dl').innerHTML = ''; link(tag() + '.3mf', blob, 'Download 3MF'); link(tag() + '.stl', new Blob([MyModel.printSTL(m, tag())]), 'STL');
    st(`${fmtN(m.info.size)} mm square, ${fmtN(m.info.height, 1)} mm at its highest ground, ${fmtN(m.info.buildings)} buildings, ${fmtN(m.info.volume)} cm³ solid${m.info.genus !== 0 ? '' : ''}. Watertight.`);
    preview3D(m);
  }
  let three = null;
  function preview3D(m) {
    $('#preview').hidden = false; $('#pvSvg').innerHTML = '';
    if (!three) {
      const cv = $('#pv3d'), r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setClearColor(0x0b1d24);
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 16 / 9, 1, 5000);
      sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, .75)); const dl = new THREE.DirectionalLight(0xffffff, .8); dl.position.set(-1, -1.2, 2); sc.add(dl);
      const ctl = new THREE.OrbitControls(cam, cv); ctl.enableDamping = true;
      three = { r, sc, cam, ctl, mesh: null };
      const loop = () => { const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * devicePixelRatio) { r.setPixelRatio(devicePixelRatio); r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } ctl.update(); r.render(sc, cam); requestAnimationFrame(loop); };
      loop();
    }
    if (three.mesh) { three.sc.remove(three.mesh); three.mesh.geometry.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals();
    three.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xf2efe7 })); three.sc.add(three.mesh);
    const s = m.info.size; three.cam.up.set(0, 0, 1); three.cam.position.set(s * .5 - s * .55, -s * .75, s * .8); three.ctl.target.set(s / 2, s / 2, 0); three.ctl.update();
  }

  // ---------------------------------------------------------------- laser contour kit
  async function makeLaser() {
    const board = +$('#board').value, [sw, sh] = $('#sheet').value.split('x').map(Number), g = ground();
    prog('Slicing the contours…', .1); await new Promise(r => setTimeout(r, 30));
    MyModel.setScale(S.scale);
    const M = MyModel.buildModel(D, { x0: S.x0, y0: S.y0, size: g }, board, { scale: S.scale });
    if (!M.layers.length) throw new Error('This square is flat at this board thickness: try a thinner board or a larger scale.');
    const K = 1000 / S.scale, G = M.G;
    if ($('#engB').checked) {                                                  // building footprints engraved on the layer they stand on
      BLD.items.forEach(([h, gr, polys]) => {
        if (!inBox(polys, G.x0, G.y0, G.size)) return;
        let i = M.layers.length - 1; while (i > 0 && M.layers[i].L > gr) i--;
        if (M.layers[i].L > gr) return;                                        // stands on the base board
        polys.forEach(p => p.forEach(r => { const pts = r.map(([x, y]) => [(x - G.x0) * K, (y - G.y0) * K]); pts.push(pts[0]); M.layers[i].engrave.push(pts); }));
      });
    }
    prog(`Nesting ${M.layers.length} layers on ${sw} × ${sh} mm sheets…`, .4); await new Promise(r => setTimeout(r, 30));
    const pk = MyModel.nest(M.layers, sw, sh, 8, 3);
    if (pk.error) throw new Error(pk.error);
    prog('Writing the sheets…', .8);
    const zip = new JSZip(), title = `Sligo 1:${S.scale} ${board} mm`;
    for (let i = 0; i < pk.count; i++) { const nn = String(i + 1).padStart(2, '0'); zip.file(`sheet_${nn}.svg`, MyModel.toSVG(pk, i, `${title} sheet ${nn}`)); zip.file(`sheet_${nn}.dxf`, MyModel.toDXF(pk, i)); }
    const plan = contourMap({ interval: board / K >= 2 ? board / K : 2, paper: 'kit', buildings: true, roads: true, water: true, layers: M });
    zip.file('contour_plan.pdf', plan.pdf); zip.file('contour_plan.svg', plan.svg);
    zip.file('README.txt', `${title}\nSquare: ${fmtN(g)} m, SW corner ITM ${Math.round(X0 + S.x0)}, ${Math.round(Y0 + S.y0)}\nBoard ${board} mm = ${fmtN(board / K, 2)} m per layer at 1:${S.scale}; ${M.layers.length} layers on ${pk.count} sheets of ${sw} × ${sh} mm.\nCut: red. Engrave: blue (the next layer's outline, layer numbers and building footprints).\nStack the layers in number order on a base board the size of the square. Layers are hollowed under the one above to save board.\nMade with the As Water Arrives Sligo model website (A-IARG 2027, ATU Sligo).\n`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    $('#dl').innerHTML = ''; link(tag() + `_laser_${board}mm.zip`, blob, 'Download the kit (ZIP)');
    st(`${M.layers.length} layers of ${board} mm on ${pk.count} sheet${pk.count > 1 ? 's' : ''} of ${sw} × ${sh} mm. Each layer is ${fmtN(board / K, 2)} m of ground.`);
    $('#preview').hidden = false; $('#pvSvg').innerHTML = MyModel.toSVG(pk, 0, 'sheet 1').replace(/<\?xml[^>]*>/, '');
  }

  // ---------------------------------------------------------------- contour map (also the plan inside the laser kit)
  function contourMap(o) {
    const K = 1000 / S.scale, g = ground();
    const A1 = S.size > 400 && o.paper !== 'kit', kit = o.paper === 'kit';
    const PW = kit ? S.size + 110 : A1 ? 841 : 420, PH = kit ? S.size + 30 : A1 ? 594 : 297, mg = 15, sq = kit ? S.size : PH - 2 * mg;
    const mx = mg, my = mg, panel = mx + sq + 12;
    MyModel.setScale(S.scale);
    const G = MyModel.windowGrid(D, { x0: S.x0, y0: S.y0, size: g });
    const P = (x, y) => [mx + (x - G.x0) * K, my + sq - (y - G.y0) * K];
    const items = [];                                                         // { k: 'poly'|'line', pts, fill, stroke, w }
    if (o.water) WAT.items.forEach(([lv, polys]) => polys.forEach(p => items.push({ k: 'poly', rings: p.map(r => r.map(([x, y]) => P(x, y))), fill: '#cfe5f5', stroke: '#5a9fd4', w: .15 })));
    const segs = MyModel.planSegments(G, o.interval);
    segs.forEach(({ L, segs: s }) => {
      const idx = Math.abs(L / (o.interval * 5) - Math.round(L / (o.interval * 5))) < 1e-6;
      for (let i = 0; i < s.length; i += 4) items.push({ k: 'line', pts: [P(s[i], s[i + 1]), P(s[i + 2], s[i + 3])], stroke: idx ? '#7a5a3a' : '#b89a78', w: idx ? .35 : .18 });
    });
    if (o.roads) RDS.polygons.forEach(p => { if (!p[0].some(([x, y]) => x > G.x0 - 50 && y > G.y0 - 50 && x < G.x0 + g + 50 && y < G.y0 + g + 50)) return; items.push({ k: 'poly', rings: p.map(r => r.map(([x, y]) => P(x, y))), fill: '#ffffff', stroke: '#888888', w: .12 }); });
    if (o.buildings) BLD.items.forEach(([, , polys]) => polys.forEach(p => { if (!p[0].some(([x, y]) => x > G.x0 - 20 && y > G.y0 - 20 && x < G.x0 + g + 20 && y < G.y0 + g + 20)) return; items.push({ k: 'poly', rings: p.map(r => r.map(([x, y]) => P(x, y))), fill: '#3a3f42', stroke: '#1e2224', w: .1 }); }));
    // ITM grid ticks
    const gstep = S.scale <= 1000 ? 100 : 250, E0 = X0 + G.x0, N0 = Y0 + G.y0, ticks = [];
    for (let E = Math.ceil(E0 / gstep) * gstep; E <= E0 + g; E += gstep) ticks.push(['E', E, mx + (E - E0) * K]);
    for (let N = Math.ceil(N0 / gstep) * gstep; N <= N0 + g; N += gstep) ticks.push(['N', N, my + sq - (N - N0) * K]);
    // ---- SVG
    const f2 = v => v.toFixed(2), poly = it => `<path d="${it.rings.map(r => 'M' + r.map(([x, y]) => f2(x) + ',' + f2(y)).join('L') + 'Z').join('')}" fill="${it.fill}" stroke="${it.stroke}" stroke-width="${it.w}" fill-rule="evenodd"/>`;
    const line = it => `<path d="M${f2(it.pts[0][0])},${f2(it.pts[0][1])}L${f2(it.pts[1][0])},${f2(it.pts[1][1])}" stroke="${it.stroke}" stroke-width="${it.w}" fill="none"/>`;
    const sb = S.scale <= 1000 ? 100 : 250, sbmm = sb * K;
    const txt = [
      [panel, my + 10, 8, 'As Water Arrives', 'serif'], [panel, my + 17, 4, 'Sligo borough · A-IARG 2027 · ATU Sligo'],
      [panel, my + 30, 4.2, `Scale 1:${fmtN(S.scale)} ${kit ? '' : 'on ' + (A1 ? 'A1' : 'A3')}`], [panel, my + 36, 3.4, `Contours every ${o.interval} m, index every ${o.interval * 5} m (m OD, Malin Head)`],
      [panel, my + 42, 3.4, `South-west corner ITM E ${fmtN(E0)}, N ${fmtN(N0)}`], [panel, my + 48, 3.4, `${fmtN(g)} m square`],
      [panel, PH - mg - 14, 2.6, 'Ground: 2006 Sligo survey, OPW lidar 2011 (CC BY 4.0).'], [panel, PH - mg - 10, 2.6, 'Buildings: Tailte Éireann. Roads and water: © OpenStreetMap contributors.'], [panel, PH - mg - 6, 2.6, 'Made with the As Water Arrives model website.']];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}"><rect width="${PW}" height="${PH}" fill="#fff"/>
<defs><clipPath id="c"><rect x="${mx}" y="${my}" width="${sq}" height="${sq}"/></clipPath></defs><g clip-path="url(#c)">${items.map(it => it.k === 'poly' ? poly(it) : line(it)).join('')}</g>
<rect x="${mx}" y="${my}" width="${sq}" height="${sq}" fill="none" stroke="#000" stroke-width=".4"/>
${ticks.map(([a, v, p]) => a === 'E' ? `<path d="M${f2(p)},${my}v-3M${f2(p)},${my + sq}v3" stroke="#000" stroke-width=".2"/><text x="${f2(p)}" y="${my + sq + 6}" font-size="2.4" text-anchor="middle" font-family="sans-serif">${v}</text>` : `<path d="M${mx},${f2(p)}h-3M${mx + sq},${f2(p)}h3" stroke="#000" stroke-width=".2"/><text x="${mx + sq + 4}" y="${f2(p + .8)}" font-size="2.4" font-family="sans-serif">${v}</text>`).join('')}
${txt.map(([x, y, s, t, fam]) => `<text x="${x + 6}" y="${y}" font-size="${s}" font-family="${fam || 'sans-serif'}">${esc(t)}</text>`).join('')}
<g transform="translate(${panel + 6},${my + 58})"><rect width="${f2(sbmm / 2)}" height="2" fill="#000"/><rect x="${f2(sbmm / 2)}" width="${f2(sbmm / 2)}" height="2" fill="#fff" stroke="#000" stroke-width=".2"/><text y="6" font-size="2.6" font-family="sans-serif">0</text><text x="${f2(sbmm)}" y="6" font-size="2.6" text-anchor="end" font-family="sans-serif">${sb} m</text></g>
<g transform="translate(${panel + 12},${my + 80})"><path d="M0,-8L4,6L0,3L-4,6Z" fill="#000"/><text y="-10" font-size="4" text-anchor="middle" font-family="sans-serif">N</text></g></svg>`;
    // ---- PDF
    const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PW, PH] });
    doc.saveGraphicsState(); doc.rect(mx, my, sq, sq, null); doc.clip(); doc.discardPath();
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    items.forEach(it => {
      doc.setLineWidth(it.w); doc.setDrawColor(...hex(it.stroke));
      if (it.k === 'line') { doc.line(it.pts[0][0], it.pts[0][1], it.pts[1][0], it.pts[1][1]); return; }
      it.rings.forEach((r, ri) => { if (r.length < 3) return; doc.setFillColor(...hex(ri ? '#ffffff' : it.fill)); const d = r.slice(1).map((p, i) => [p[0] - r[i][0], p[1] - r[i][1]]); doc.lines(d, r[0][0], r[0][1], [1, 1], 'FD', true); });
    });
    doc.restoreGraphicsState();
    doc.setDrawColor(0); doc.setLineWidth(.4); doc.rect(mx, my, sq, sq);
    doc.setFontSize(6.5); ticks.forEach(([a, v, p]) => { doc.setLineWidth(.2); if (a === 'E') { doc.line(p, my, p, my - 3); doc.line(p, my + sq, p, my + sq + 3); doc.text(String(v), p, my + sq + 6, { align: 'center' }); } else { doc.line(mx, p, mx - 3, p); doc.line(mx + sq, p, mx + sq + 3, p); doc.text(String(v), mx + sq + 4, p + .8); } });
    txt.forEach(([x, y, s, t, fam]) => { doc.setFont(fam ? 'times' : 'helvetica', fam ? 'bold' : 'normal'); doc.setFontSize(s * 2.83); doc.text(t, x + 6, y); });
    doc.setFillColor(0); doc.rect(panel + 6, my + 58, sbmm / 2, 2, 'F'); doc.rect(panel + 6 + sbmm / 2, my + 58, sbmm / 2, 2); doc.setFontSize(7); doc.text('0', panel + 6, my + 64); doc.text(sb + ' m', panel + 6 + sbmm, my + 64, { align: 'right' });
    doc.triangle(panel + 12, my + 72, panel + 16, my + 86, panel + 8, my + 86, 'F'); doc.setFontSize(11); doc.text('N', panel + 12, my + 70, { align: 'center' });
    return { svg, pdf: doc.output('blob') };
  }
  async function makeMap() {
    prog('Drawing the contours…', .3); await new Promise(r => setTimeout(r, 30));
    const m = contourMap({ interval: +$('#interval').value, paper: S.size > 400 ? 'A1' : 'A3', buildings: $('#mB').checked, roads: $('#mR').checked, water: $('#mW').checked });
    $('#dl').innerHTML = ''; link(tag() + '_contours.pdf', m.pdf, 'Download PDF'); link(tag() + '_contours.svg', new Blob([m.svg], { type: 'image/svg+xml' }), 'SVG');
    st(`Contour plan at 1:${fmtN(S.scale)} on ${S.size > 400 ? 'A1' : 'A3'}, ${fmtN(ground())} m square.`);
    $('#preview').hidden = false; $('#pvSvg').innerHTML = m.svg;
  }

  $('#make').onclick = async () => {
    $('#make').disabled = true; $('#dl').innerHTML = '';
    try { await (S.p === 'print' ? makePrint() : S.p === 'laser' ? makeLaser() : makeMap()); }
    catch (e) { console.error(e); st('Could not make it: ' + e.message, true); }
    finally { $('#make').disabled = false; $('#prog').hidden = true; }
  };
  st('Drag the square to where you want it, then choose Make it. Double-click the map to jump the square there.');
})().catch(e => { console.error(e); const s = document.getElementById('status'); if (s) { s.textContent = 'The page could not start: ' + e.message; s.classList.add('err'); } });
