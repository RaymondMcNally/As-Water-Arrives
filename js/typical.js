/* Typical traffic: a model of how busy Sligo's main roads usually are at a given time, for when no live feed is
   available. It is not measured traffic. Busyness = (share of the day's traffic in that hour, against the weekday
   evening peak) × (weight for the road class) + a little more near the town centre, where junctions and bridges queue.
   The hourly shares are a typical Irish urban count profile: weekday peaks at 08:00 and 17:00, a later, flatter
   Saturday, and a quieter Sunday. */
(function () {
  'use strict';
  const PROF = {                                                     // % of the day's traffic in each hour, 00:00–23:00
    wk: [0.8, 0.5, 0.3, 0.3, 0.4, 1.0, 2.6, 5.8, 7.6, 6.0, 5.6, 5.9, 6.2, 6.3, 6.4, 7.0, 7.8, 8.2, 6.6, 4.9, 3.8, 3.0, 2.2, 1.4],
    sat: [1.4, 0.9, 0.6, 0.4, 0.4, 0.6, 1.2, 2.4, 4.0, 5.6, 6.8, 7.6, 7.9, 7.8, 7.5, 7.2, 6.9, 6.4, 5.4, 4.2, 3.4, 2.8, 2.3, 1.8],
    sun: [1.6, 1.1, 0.7, 0.5, 0.4, 0.4, 0.7, 1.3, 2.4, 3.8, 5.4, 6.8, 7.6, 7.8, 7.6, 7.4, 7.1, 6.6, 5.8, 4.7, 3.7, 2.9, 2.1, 1.3]
  };
  const PEAK = 8.2;
  const W = { motorway: .9, trunk: .85, trunk_link: .7, primary: .8, primary_link: .65, secondary: .68, secondary_link: .55, tertiary: .52, tertiary_link: .45 };
  const COL = ['#3cb44b', '#ffb300', '#e53935', '#8e1b1b'];
  const T = {
    W, STEP: 600,                                                    // the picture changes every 10 minutes of clock time
    step: c => Math.floor(c.t / 600),
    share(c) { const p = PROF[c.day] || PROF.wk, h = (((c.t / 3600) % 24) + 24) % 24, i = Math.floor(h), f = h - i; return (p[i] * (1 - f) + p[(i + 1) % 24] * f) / PEAK; },
    // busyness of a road of class fc whose middle is d metres from Lady Erin; -1 if it is not a main road
    level(fc, d, c) { const w = W[fc]; if (!w) return -1; return T.share(c) * (w + .3 * Math.max(0, 1 - d / 1200)); },
    colour: s => COL[s < .5 ? 0 : s < .7 ? 1 : s < .9 ? 2 : 3],
    legend: [[COL[0], 'Moving freely'], [COL[1], 'Busy'], [COL[2], 'Slow'], [COL[3], 'Queuing']]
  };
  AW.typicalTraffic = T;
})();
