/* Shared helpers for the As Water Arrives · Sligo borough model website.
   Coordinates: ITM (EPSG:2157) metres. Map data from God's Eye is WGS 84 lon/lat. */
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = (v, d = 0) => v == null || Number.isNaN(+v) ? '—' : Number(v).toLocaleString('en-IE', { maximumFractionDigits: d, minimumFractionDigits: d });

  // WGS 84 → ITM (GRS80 Transverse Mercator), within a few cm over Sligo
  function toITM(lon, lat) {
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.99982, lat0 = 53.5 * Math.PI / 180, lon0 = -8 * Math.PI / 180;
    const e2 = 2 * f - f * f, ep2 = e2 / (1 - e2), phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
    const M = p => a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
    const s = Math.sin(phi), c = Math.cos(phi), N = a / Math.sqrt(1 - e2 * s * s), T = Math.tan(phi) ** 2, C = ep2 * c * c, A = (lam - lon0) * c;
    const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
    const y = k0 * (M(phi) - M(lat0) + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    return [600000 + x, 750000 + y];
  }
  // ITM → WGS 84 (inverse by two Newton steps on toITM; good to millimetres here)
  function fromITM(E, N) {
    let lon = -8.47 + (E - 569000) / 65300, lat = 54.27 + (N - 835800) / 111250;
    for (let i = 0; i < 4; i++) {
      const [e0, n0] = toITM(lon, lat), [e1] = toITM(lon + 1e-5, lat), [, n2] = toITM(lon, lat + 1e-5);
      lon += (E - e0) / ((e1 - e0) / 1e-5); lat += (N - n0) / ((n2 - n0) / 1e-5);
    }
    return [lon, lat];
  }

  const cache = {};
  async function getJSON(path) {
    if (!cache[path]) cache[path] = fetch(path).then(r => { if (!r.ok) throw new Error(path + ': ' + r.status); return r.json(); });
    return cache[path];
  }
  async function getBin(path) {
    const r = await fetch(path); if (!r.ok) throw new Error(path + ': ' + r.status);
    return new Int16Array(await r.arrayBuffer());
  }

  // terrain: Int16 centimetres on a square grid, row 0 = south, local metres from the SW corner (origin in terrain.json)
  async function terrain(name = 'dtm2m') {
    const meta = await getJSON('data/model/terrain.json'), g = meta.grids[name], q = await getBin(`data/model/${name}.bin`);
    const n = g.n, step = g.step, [X0, Y0] = meta.origin;
    const sample = (x, y) => {                              // local metres → m OD (bilinear); NaN outside
      const c = x / step, r = y / step; if (c < 0 || r < 0 || c > n - 1 || r > n - 1) return NaN;
      const c0 = Math.min(n - 2, Math.floor(c)), r0 = Math.min(n - 2, Math.floor(r)), tx = c - c0, ty = r - r0, k = r0 * n + c0;
      return ((q[k] * (1 - tx) + q[k + 1] * tx) * (1 - ty) + (q[k + n] * (1 - tx) + q[k + n + 1] * tx) * ty) / 100;
    };
    return { n, step, X0, Y0, size: meta.size, sample, sampleITM: (E, N) => sample(E - X0, N - Y0) };
  }

  // the channel the kiosk, the projection page and the projector window share
  const BUS_NAME = 'aiarg-sligo-model';
  function bus(onMsg) {
    const ch = 'BroadcastChannel' in window ? new BroadcastChannel(BUS_NAME) : null;
    if (ch && onMsg) ch.onmessage = e => onMsg(e.data);
    return { send: m => { try { ch && ch.postMessage(m); } catch (e) { } }, ch };
  }

  function download(name, data, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  root.AW = { $, esc, fmtN, toITM, fromITM, getJSON, getBin, terrain, bus, download, BUS_NAME };
})(window);
