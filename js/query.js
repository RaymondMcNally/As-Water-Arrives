/* Query engine shared by the kiosk and the projector (from Sligo God's Eye, public fields only).
   Buildings and census small areas; AND conditions; small-area fields can filter buildings with the prefix "a.". */
(function (root) {
  'use strict';
  const BF = {
    u: { l: 'Use', t: 'cat' }, fn: { l: 'Function', t: 'cat' }, z: { l: 'Zone code', t: 'cat' },
    h: { l: 'Height', t: 'num', unit: 'm' }, fp: { l: 'Footprint', t: 'num', unit: 'm²' }, gr: { l: 'Ground level', t: 'num', unit: 'm OD', d: 1 },
    fs: { l: 'Sea level that first reaches it', t: 'num', unit: 'm OD', d: 1 }, fl: { l: 'Lough Gill level that first reaches it', t: 'num', unit: 'm OD', d: 1 },
    dw: { l: 'Distance to water', t: 'num', unit: 'm' }, op: { l: 'OPW river flood zone (% chance a year; 10 = most likely)', t: 'num' },
    cf2: { l: 'OPW sea: rise at which a 1-in-2-year storm tide reaches it (0 = today)', t: 'num', unit: 'm', d: 1 }, cf20: { l: 'OPW sea: rise at which a 1-in-20-year flood reaches it (0 = today)', t: 'num', unit: 'm', d: 1 },
    cf100: { l: 'OPW sea: rise at which a 1-in-100-year flood reaches it (0 = today)', t: 'num', unit: 'm', d: 1 },
    om: { l: 'OPW river flood zone, mid-range future (% a year)', t: 'num' }, oh: { l: 'OPW river flood zone, high-end future (% a year)', t: 'num' },
    na: { l: 'Addresses', t: 'num' }, nr: { l: 'Homes', t: 'num' }, nc: { l: 'Commercial units', t: 'num' },
    nv: { l: 'Vacant addresses', t: 'num' }, nvr: { l: 'Vacant homes', t: 'num' }, nvc: { l: 'Vacant commercial units', t: 'num' },
    uc: { l: 'Under construction', t: 'num' }, py: { l: 'Last sale year', t: 'num' }
  };
  const AF = {
    ed_english: { l: 'Electoral division', t: 'cat' }, pop_total: { l: 'Population', t: 'num' }, households: { l: 'Households', t: 'num' },
    pct_age_0_14: { l: 'Aged 0–14', t: 'num', unit: '%' }, pct_age_65_plus: { l: 'Aged 65+', t: 'num', unit: '%' },
    pct_one_person_hh: { l: 'One-person households', t: 'num', unit: '%' }, pct_flat_apartment: { l: 'Apartments', t: 'num', unit: '%' },
    pct_built_pre_1919: { l: 'Built before 1919', t: 'num', unit: '%' }, pct_built_2011_on: { l: 'Built 2011 or later', t: 'num', unit: '%' },
    pct_owner_occupied: { l: 'Owner-occupied', t: 'num', unit: '%' }, pct_rent_private: { l: 'Rented privately', t: 'num', unit: '%' },
    pct_rent_social: { l: 'Social rent', t: 'num', unit: '%' }, pct_heat_oil: { l: 'Oil heating', t: 'num', unit: '%', hot: 1 },
    pct_has_renewables: { l: 'Has renewables', t: 'num', unit: '%' }, pct_dwellings_vacant: { l: 'Vacant dwellings, census night', t: 'num', unit: '%', hot: 1 },
    unemployment_rate: { l: 'Unemployment rate', t: 'num', unit: '%', hot: 1 }, pct_third_level: { l: 'Third-level educated', t: 'num', unit: '%' },
    pct_work_by_car: { l: 'Drive to work', t: 'num', unit: '%' }, pct_work_walk_cycle: { l: 'Walk or cycle to work', t: 'num', unit: '%' },
    pct_work_from_home: { l: 'Work from home', t: 'num', unit: '%' }, pct_hh_no_car: { l: 'Households with no car', t: 'num', unit: '%' },
    pct_ber_d_or_worse: { l: 'BER D or worse', t: 'num', unit: '%', hot: 1 }, pct_ber_e_to_g: { l: 'BER E to G', t: 'num', unit: '%', hot: 1 },
    ber_pct_heat_pump: { l: 'Heat pumps (of BERs)', t: 'num', unit: '%' }, ber_pct_solar_pv: { l: 'Solar PV (of BERs)', t: 'num', unit: '%' },
    dep_score_rel: { l: 'Deprivation score (reconstructed)', t: 'num', d: 1, div: 1 }, dep_cat: { l: 'Deprivation category, 1 = most deprived', t: 'num' },
    dep_label: { l: 'Deprivation', t: 'cat' }
  };
  const fieldDef = k => k.startsWith('a.') ? AF[k.slice(2)] : BF[k];
  const fmtN = (v, d = 0) => v == null || Number.isNaN(+v) ? '—' : Number(v).toLocaleString('en-IE', { maximumFractionDigits: d, minimumFractionDigits: d });
  function fmtField(k, v) {
    const f = fieldDef(k) || {}; if (v == null) return '—';
    if (f.t === 'cat') return String(v);
    return fmtN(v, f.d ?? (f.unit === '%' ? 1 : 0)) + (f.unit ? (f.unit === '%' ? '%' : ' ' + f.unit) : '');
  }
  function test(v, op, val) {
    if (v == null) return false;
    if (op === 'contains') return String(v).toLowerCase().includes(String(val).toLowerCase());
    if (typeof v === 'number') { const x = Number(val); if (Number.isNaN(x)) return false;
      return op === '>' ? v > x : op === '>=' ? v >= x : op === '<' ? v < x : op === '<=' ? v <= x : op === '=' ? v === x : op === '!=' ? v !== x : false; }
    const a = String(v).toLowerCase(), b = String(val).toLowerCase();
    return op === '=' ? a === b : op === '!=' ? a !== b : false;
  }
  function normKey(k, tgt) { k = String(k || '').trim(); if (tgt === 'a') return k.startsWith('a.') ? k : 'a.' + k; if (BF[k]) return k; if (AF[k]) return 'a.' + k; return k; }
  // D = { B: [building features], A: [area features], SA: {code → area props} }
  function run(D, q) {
    const tgt = q.target === 'a' || q.target === 'areas' ? 'a' : 'b';
    const conds = (q.conditions || []).map(c => ({ key: normKey(c.field, tgt), op: c.op || '>', value: c.value })).filter(c => fieldDef(c.key));
    const rows = tgt === 'a' ? D.A.map(a => a.properties) : D.B.map(b => b.properties);
    const val = (key, p) => key.startsWith('a.') ? (tgt === 'a' ? p : D.SA[p.sa] || {})[key.slice(2)] : p[key];
    const ids = [];
    rows.forEach((p, i) => { if (conds.every(c => test(val(c.key, p), c.op, c.value))) ids.push(i); });
    if (q.sort_by) { const sk = normKey(q.sort_by, tgt), dir = q.sort_desc === false ? 1 : -1; ids.sort((i, j) => ((val(sk, rows[i]) ?? -Infinity) - (val(sk, rows[j]) ?? -Infinity)) * dir); }
    return { tgt, ids, rows, conds };
  }
  function summary(D, r) {
    const P = r.ids.map(i => r.rows[i]);
    const sum = k => P.reduce((s, p) => s + (+p[k] || 0), 0);
    if (r.tgt === 'b') return { count: P.length, homes: sum('nr'), commercial: sum('nc'), vacantHomes: sum('nvr'), vacantCommercial: sum('nvc') };
    return { count: P.length, population: sum('pop_total'), households: sum('households') };
  }

  // presets: water first (the conference theme), then the town
  const PRESETS = [
    { g: 'water', n: 'Reached by the sea at 3 m OD', s: 'A high spring tide with a storm surge on top', q: { target: 'b', conditions: [{ field: 'fs', op: '<=', value: 3 }] }, flood: { src: 'sea', level: 3 } },
    { g: 'water', n: 'Reached by the sea at 4 m OD', s: 'The same, with about a metre of sea-level rise', q: { target: 'b', conditions: [{ field: 'fs', op: '<=', value: 4 }] }, flood: { src: 'sea', level: 4 } },
    { g: 'water', n: 'Reached if Lough Gill rose to 6 m OD', s: 'About two metres above its usual level', q: { target: 'b', conditions: [{ field: 'fl', op: '<=', value: 6 }] }, flood: { src: 'lake', level: 6 } },
    { g: 'water', n: 'In the OPW 1-in-10-year flood zone', s: 'River flood map: a 10% chance each year', q: { target: 'b', conditions: [{ field: 'op', op: '>=', value: 10 }] }, flood: { src: 'opw', level: 10 } },
    { g: 'water', n: 'In the OPW 1-in-100-year flood zone', s: 'River flood map: a 1% chance each year', q: { target: 'b', conditions: [{ field: 'op', op: '>=', value: 1 }] }, flood: { src: 'opw', level: 1 } },
    { g: 'water', n: 'The sea today: a 1-in-100-year storm', s: 'OPW coastal flood map, present day', q: { target: 'b', conditions: [{ field: 'cf100', op: '<=', value: 0 }] }, flood: { src: 'coast', level: 0, rp: 100 } },
    { g: 'water', n: 'Sea 1 m higher: a 1-in-100-year storm', s: 'OPW high-end future, about 2100', q: { target: 'b', conditions: [{ field: 'cf100', op: '<=', value: 1 }] }, flood: { src: 'coast', level: 1, rp: 100 } },
    { g: 'water', n: 'Sea 0.5 m higher: a storm tide every other year', s: 'OPW mid-range future, about 2100: a flood with a 1-in-2 chance each year', q: { target: 'b', conditions: [{ field: 'cf2', op: '<=', value: 0.5 }] }, flood: { src: 'coast', level: 0.5, rp: 2 } },
    { g: 'water', n: 'Homes within 50 m of water', s: 'River, harbour, bay and lake edge', q: { target: 'b', conditions: [{ field: 'nr', op: '>', value: 0 }, { field: 'dw', op: '<=', value: 50 }] } },
    { g: 'water', n: 'Built below 4 m OD', s: 'Ground floor lower than four metres above mean sea level', q: { target: 'b', conditions: [{ field: 'gr', op: '<', value: 4 }] } },
    { g: 'water', n: 'Vacant buildings by the water', s: 'Within 100 m of the river, harbour or lake', q: { target: 'b', conditions: [{ field: 'nv', op: '>', value: 0 }, { field: 'dw', op: '<=', value: 100 }] } },
    { g: 'town', n: 'Vacant homes', q: { target: 'b', conditions: [{ field: 'nvr', op: '>', value: 0 }] } },
    { g: 'town', n: 'Vacant commercial', q: { target: 'b', conditions: [{ field: 'nvc', op: '>', value: 0 }] } },
    { g: 'town', n: 'Vacant homes in the town centre', q: { target: 'b', conditions: [{ field: 'nvr', op: '>', value: 0 }, { field: 'z', op: '=', value: 'C1' }] } },
    { g: 'town', n: 'Taller than 15 m', q: { target: 'b', conditions: [{ field: 'h', op: '>=', value: 15 }] } },
    { g: 'town', n: 'Most deprived areas', q: { target: 'a', conditions: [{ field: 'dep_cat', op: '<=', value: 2 }], sort_by: 'dep_score_rel', sort_desc: false } },
    { g: 'town', n: 'Worst energy ratings', q: { target: 'a', conditions: [{ field: 'pct_ber_e_to_g', op: '>=', value: 50 }], sort_by: 'pct_ber_e_to_g' } },
    { g: 'town', n: 'Oil-heated, poor BER', q: { target: 'a', conditions: [{ field: 'pct_heat_oil', op: '>=', value: 60 }, { field: 'pct_ber_d_or_worse', op: '>=', value: 50 }], sort_by: 'pct_ber_d_or_worse' } },
    { g: 'town', n: 'Households with no car', q: { target: 'a', conditions: [{ field: 'pct_hh_no_car', op: '>=', value: 30 }], sort_by: 'pct_hh_no_car' } }
  ];

  // colours: the same in the kiosk and on the model
  const C = { match: '#ffb000', water: '#2f8fd8', sea: '#3fa9f5', lake: '#36c6d3', opw: '#8f86ff', coast: '#4f6dff', opwBands: { 10: '#6f63ff', 5: '#9b8cff', 1: '#c9c0ff' }, road: '#ffffff', scheme: '#ff6a2a', dim: '#16232a' };
  const RAMP = ['#0d2a33', '#124c5c', '#1b7a8f', '#3fb0c4', '#9fe6f0'], HOT = ['#0f1f26', '#3a2a1c', '#8a4b12', '#d98a0b', '#ffd36a'], DIV = ['#ff5a45', '#b0513d', '#4b5960', '#2c7f93', '#5fd4e6'];
  function areaColours(A, key) {
    const f = AF[key] || {}; const vals = A.map(a => a.properties[key]);
    if (f.t === 'cat') { const cats = [...new Set(vals.filter(v => v != null))].sort(); const col = {}; cats.forEach((c, i) => col[c] = RAMP[Math.min(4, Math.round(i * 4 / Math.max(1, cats.length - 1)))]); return { get: v => v == null ? null : col[v], legend: cats.map(c => [col[c], c]) }; }
    const ramp = f.div ? DIV : f.hot ? HOT : RAMP;
    const v = vals.filter(x => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
    const br = f.div ? [-20, -10, 0, 10] : [...new Set([1, 2, 3, 4].map(i => v[Math.floor(i * v.length / 5)]))];
    const get = x => { if (x == null || Number.isNaN(x)) return null; let i = 0; while (i < br.length && x >= br[i]) i++; return ramp[Math.min(i, 4)]; };
    const edges = [v[0], ...br, v[v.length - 1]], legend = [];
    for (let i = 0; i < edges.length - 1; i++) legend.push([ramp[Math.min(i, 4)], fmtField('a.' + key, edges[i]) + ' – ' + fmtField('a.' + key, edges[i + 1])]);
    return { get, legend };
  }

  root.Q = { BF, AF, fieldDef, fmtField, normKey, run, summary, PRESETS, C, areaColours };
})(window);
