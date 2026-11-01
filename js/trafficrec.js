/* A recorded day of TomTom traffic, for "a day in 3 minutes".
   TomTom's free tiles only show traffic now, so record.html takes a snapshot every 15 minutes and keeps, for each main
   road, the congestion level read from the tile colours (0 free, 1 busy, 2 slow, 3 queuing; - not covered). The
   recording stays in this browser profile (localStorage); it can be exported and imported as a file.
   The road list is the main roads of data/roads.json in file order: the same list the kiosk and projector draw. */
(function () {
  'use strict';
  const KEY = 'aiarg-traffic-rec', STEP = 900, KEEP_DAYS = 21, MIN_STEPS = 72;   // 72 of 96 quarter-hours makes a usable day
  const R = {
    KEY, STEP,
    // the main roads, split into simple lines, with lon/lat and their distance from Lady Erin (ITM metres)
    segments(roads, centre) {
      const out = [];
      roads.features.forEach(f => {
        const fc = f.properties.fclass; if (!AW.typicalTraffic.W[fc]) return; const g = f.geometry;
        (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]).forEach(cs => { const m = AW.toITM(...cs[cs.length >> 1]); out.push({ fc, ll: cs, d: Math.hypot(m[0] - centre[0], m[1] - centre[1]) }); });
      });
      return out;
    },
    read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { v: 1, days: {} }; } catch (e) { return { v: 1, days: {} }; } },
    write(r) {
      const ds = Object.keys(r.days).sort(); while (ds.length > KEEP_DAYS) delete r.days[ds.shift()];
      try { localStorage.setItem(KEY, JSON.stringify(r)); return true; } catch (e) { return false; }
    },
    // the most recent weekday with enough snapshots, as sorted [[t, levels], …]
    _c: null, _at: 0,
    bestDay() {
      if (R._c !== null && Date.now() - R._at < 60000) return R._c;
      const r = R.read(); let best = null;
      Object.keys(r.days).sort().reverse().some(d => { const D = r.days[d]; if (D.wd >= 1 && D.wd <= 5 && Object.keys(D.steps).length >= MIN_STEPS && (D.n || r.nseg) === r.nseg) { best = { date: d, n: D.n || r.nseg, steps: Object.entries(D.steps).map(([t, l]) => [+t, l]).sort((a, b) => a[0] - b[0]) }; return true; } return false; });
      R._c = best; R._at = Date.now(); return best;
    },
    // levels (-1 to 3) for every road at clock time t, from the snapshot at or before t
    at(day, t) {
      const st = day.steps; let k = 0; while (k < st.length - 1 && st[k + 1][0] <= t) k++;
      const l = st[k][1]; return Array.from(l, ch => ch === '-' ? -1 : +ch);
    },
    label(day) { const d = new Date(day.date + 'T12:00:00'); return d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }); },
    // TomTom "relative" colours → level. Green free, yellow/orange busy, red slow, dark red queuing; grey or clear: none
    classify(r, g, b, a) {
      if (a < 80) return -1;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 45) return -1;
      let h; if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2); else h = 60 * ((r - g) / (mx - mn) + 4); if (h < 0) h += 360;
      if (h >= 70 && h <= 190) return 0; if (h >= 22 && h < 70) return 1; if (h < 22 || h >= 330) return mx >= 150 ? 2 : 3; return -1;
    },
    // read one snapshot: each road's level from the tiles (from AW.traffic.load), sampled every ~15 m along it
    sample(segs, tiles) {
      const px = {}; tiles.forEach(t => { const c = new OffscreenCanvas(256, 256), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(t.img, 0, 0); px[t.x + '/' + t.y] = x.getImageData(0, 0, 256, 256).data; });
      const z = tiles[0].z, T = AW.traffic;
      return segs.map(sg => {
        const v = [];
        for (let i = 1; i < sg.ll.length; i++) {
          const [a0, b0] = sg.ll[i - 1], [a1, b1] = sg.ll[i], len = Math.hypot((a1 - a0) * 65000, (b1 - b0) * 111000), n = Math.max(1, Math.round(len / 15));
          for (let j = 0; j <= n; j++) {
            const lon = a0 + (a1 - a0) * j / n, lat = b0 + (b1 - b0) * j / n, fx = T.lon2x(lon, z), fy = T.lat2y(lat, z), tx = Math.floor(fx), ty = Math.floor(fy), d = px[tx + '/' + ty]; if (!d) continue;
            const ix = Math.min(255, Math.floor((fx - tx) * 256)), iy = Math.min(255, Math.floor((fy - ty) * 256));
            let lv = -1; for (let dy = -1; dy <= 1 && lv < 0; dy++) for (let dx = -1; dx <= 1 && lv < 0; dx++) { const q = (Math.min(255, Math.max(0, iy + dy)) * 256 + Math.min(255, Math.max(0, ix + dx))) * 4; lv = R.classify(d[q], d[q + 1], d[q + 2], d[q + 3]); }
            if (lv >= 0) v.push(lv);
          }
        }
        if (v.length < 2) return '-';
        v.sort((a, b) => a - b); return String(v[Math.floor(v.length * .7)]);    // lean towards the congested part
      }).join('');
    }
  };
  AW.trafficRec = R;
})();
