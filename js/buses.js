/* Sligo town buses from the timetable (not the live feed). AW.buses() loads data/buses.json and returns:
     clock(fast)  the moment to show: today's time and timetable, or, when fast, a whole weekday every DAY_S seconds
     at(c)        every bus running at that moment: { r: route index, E, N } in ITM metres
   Both are worked out from the computer's clock, so the kiosk and the projector windows always agree without messages.
   Between stops a bus moves along its route line at an even speed, from the departure at one stop to the arrival at the next. */
(function () {
  'use strict';
  const DAY_S = 180, FROM = 5.5 * 3600, TO = 24.75 * 3600;             // fast mode: 05:30 to 00:45 in three minutes
  AW.buses = async function () {
    const J = await AW.getJSON('data/buses.json');
    const SH = J.shapes.map(s => {
      const c = s.c, x = [c[0]], y = [c[1]], d = [0];
      for (let i = 2; i < c.length; i += 2) { const a = x.length - 1; x.push(x[a] + c[i]); y.push(y[a] + c[i + 1]); d.push(d[a] + Math.hypot(c[i], c[i + 1])); }
      return { r: s.r, x, y, d };
    });
    function along(s, v) {
      const d = s.d; if (v <= 0) return [s.x[0], s.y[0]]; const n = d.length - 1; if (v >= d[n]) return [s.x[n], s.y[n]];
      let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m] <= v) lo = m; else hi = m; }
      const f = (v - d[lo]) / Math.max(1e-9, d[hi] - d[lo]); return [s.x[lo] + (s.x[hi] - s.x[lo]) * f, s.y[lo] + (s.y[hi] - s.y[lo]) * f];
    }
    function clock(fast, now = Date.now()) {
      if (fast) return { day: 'wk', t: FROM + ((now / 1000) % DAY_S) / DAY_S * (TO - FROM), fast: true };
      const d = new Date(now), wd = d.getDay();
      return { day: wd === 6 ? 'sat' : wd === 0 ? 'sun' : 'wk', t: d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000, fast: false };
    }
    function at(c) {
      const out = [];
      const add = (L, t) => {
        for (const [p, s] of L) {
          if (s > t) break; const P = J.pats[p], T = P.t, rel = t - s; if (rel > T[T.length - 1]) continue;
          let i = 0; while (i < T.length - 2 && T[i + 1] <= rel) i++;
          const f = T[i + 1] > T[i] ? Math.min(1, (rel - T[i]) / (T[i + 1] - T[i])) : 1, sh = SH[P.s];
          const [E, N] = along(sh, P.d[i] + (P.d[i + 1] - P.d[i]) * f); out.push({ r: sh.r, E, N });
        }
      };
      add(J.trips[c.day], c.t);
      if (!c.fast && c.t < 3 * 3600) add(J.trips[c.day === 'sat' ? 'wk' : c.day === 'sun' ? 'sat' : 'wk'], c.t + 86400);   // late buses from the evening before
      return out;
    }
    const hhmm = t => { t = ((t % 86400) + 86400) % 86400; return String(Math.floor(t / 3600)).padStart(2, '0') + ':' + String(Math.floor(t % 3600 / 60)).padStart(2, '0'); };
    const dayName = { wk: 'weekday', sat: 'Saturday', sun: 'Sunday' };
    return { J, routes: J.routes, lines: SH, clock, at, hhmm, dayName, DAY_S };
  };
})();
