/* Live traffic from TomTom (Traffic API, raster flow tiles): each road coloured by its speed against free flow.
   The API key is kept in this browser profile (localStorage), entered from the kiosk staff panel or the Projection
   page, so it never sits in the public repository. exhibition/config.json can also carry one as "tomtomKey".
   Tile addresses change only every REFRESH_MS, so the kiosk and the projector windows share one download through the
   browser cache, and the free allowance (200,000 tiles a month) goes a long way: about 50 tiles every 5 minutes, some 6,000 in a 10-hour day. */
(function () {
  'use strict';
  const LS = 'aiarg-tomtom-key', LSS = 'aiarg-tomtom-style', REFRESH_MS = 5 * 60 * 1000, Z = 15;
  const STYLES = ['relative0-dark', 'relative0', 'relative'];        // tried in turn if TomTom rejects a style
  let STYLE = STYLES[0];
  const style = () => { try { return localStorage.getItem(LSS) || STYLE; } catch (e) { return STYLE; } };   // read each time, so every window uses the style that works
  let cfgKey = '';
  const T = {
    REFRESH_MS, Z,
    key() { try { return localStorage.getItem(LS) || cfgKey; } catch (e) { return cfgKey; } },
    // accept a pasted key with stray bits around it: quotes, key=, apiKey:, commas, spaces
    clean(k) { k = (k || '').trim().replace(/^.*?(?:key|apikey|api_key)\s*[=:]\s*/i, '').replace(/^["'`\s]+/, '').replace(/[\s"'`;,)&]+.*$/, ''); return k; },
    setKey(k) { k = T.clean(k); try { k ? localStorage.setItem(LS, k) : localStorage.removeItem(LS); } catch (e) { } return k; },
    // a safe description of the saved key: its length and first four characters
    describe() { const k = T.key(); if (!k) return 'no key saved'; const ok = /^[A-Za-z0-9]{32}$/.test(k); return `saved key: ${k.length} characters, starts ${k.slice(0, 4)}…${ok ? '' : k.startsWith('eyJ') ? ' (this looks like a Cesium ion token, not a TomTom key)' : ' (TomTom keys are 32 letters and numbers)'}`; },
    setConfigKey(k) { cfgKey = (k || '').trim(); },
    bucket(now = Date.now()) { return Math.floor(now / REFRESH_MS); },
    url(z, x, y, b = T.bucket()) { return `https://api.tomtom.com/traffic/map/4/tile/flow/${style()}/${z}/${x}/${y}.png?key=${encodeURIComponent(T.key())}&tileSize=256&thickness=10&t=${b}`; },
    // the {z}/{x}/{y} form MapLibre wants, for one refresh bucket
    template(b = T.bucket()) { return `https://api.tomtom.com/traffic/map/4/tile/flow/${style()}/{z}/{x}/{y}.png?key=${encodeURIComponent(T.key())}&tileSize=256&thickness=4&t=${b}`; },
    lon2x: (lon, z) => (lon + 180) / 360 * 2 ** z,
    lat2y: (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; },
    x2lon: (x, z) => x / 2 ** z * 360 - 180,
    y2lat: (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); },
    // fetch one tile over Lady Erin and say plainly what happened; finds a style TomTom accepts
    async test() {
      if (!T.key()) return { ok: false, msg: 'No key saved in this browser.' };
      const z = Z, x = Math.floor(T.lon2x(-8.4757, z)), y = Math.floor(T.lat2y(54.2717, z));
      let last = '';
      const cur = style();
      for (const st of [cur, ...STYLES.filter(v => v !== cur)]) {
        const u = `https://api.tomtom.com/traffic/map/4/tile/flow/${st}/${z}/${x}/${y}.png?key=${encodeURIComponent(T.key())}&tileSize=256&thickness=10&t=test${Date.now()}`;
        let r;
        try { r = await fetch(u, { cache: 'no-store', mode: 'cors' }); }
        catch (e) { return { ok: false, msg: 'The browser could not read TomTom\'s reply (network blocked, offline, or TomTom not allowing this website). ' + e.message }; }
        if (r.ok) { STYLE = st; try { localStorage.setItem(LSS, st); } catch (e) { } return { ok: true, msg: `TomTom accepted the key (style ${st}; ${T.describe()}).` }; }
        let body = ''; try { body = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220); } catch (e) { }
        last = `TomTom said HTTP ${r.status}${body ? ': ' + body : ''}`;
        if (r.status === 401 || r.status === 403 || r.status === 429) { last += ' · ' + T.describe(); break; }  // the key, not the style
      }
      return { ok: false, msg: last };
    },
    // download the tiles covering a lon/lat box. Returns { ok, when, tiles: [{ img, nw, ne, sw }] } with corners in ITM,
    // or { ok: false, why } (no key, refused, or the browser not allowed to read them)
    async load([w, s, e, n], z = Z) {
      if (!T.key()) return { ok: false, why: 'nokey' };
      const x0 = Math.floor(T.lon2x(w, z)), x1 = Math.floor(T.lon2x(e, z)), y0 = Math.floor(T.lat2y(n, z)), y1 = Math.floor(T.lat2y(s, z)), b = T.bucket(), jobs = [];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push((async () => {
        const r = await fetch(T.url(z, x, y, b), { cache: 'force-cache', mode: 'cors' });
        if (!r.ok) { const e = new Error(r.status === 403 || r.status === 401 ? 'key' : 'http'); e.status = r.status; throw e; }
        const img = await createImageBitmap(await r.blob()), c = (i, j) => AW.toITM(T.x2lon(x + i, z), T.y2lat(y + j, z));
        return { img, nw: c(0, 0), ne: c(1, 0), sw: c(0, 1) };
      })());
      try { return { ok: true, when: Date.now(), tiles: await Promise.all(jobs) }; }
      catch (err) { return { ok: false, why: err.message === 'key' ? 'key' : err.message === 'http' ? 'http' : 'net', status: err.status }; }
    },
    why: { nokey: 'needs a TomTom key (staff panel)', key: 'TomTom refused the key', http: 'TomTom returned an error', net: 'the browser could not read TomTom\'s tiles' },
    legend: [['#3cb44b', 'Traffic flowing freely'], ['#ffb300', 'Traffic slow'], ['#e53935', 'Traffic queuing'], ['#7a1e1e', 'Traffic stopped']]
  };
  AW.traffic = T;
})();
