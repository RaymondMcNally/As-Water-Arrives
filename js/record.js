/* record.html: a TomTom traffic snapshot every 15 minutes while recording is on, saved by AW.trafficRec. */
(async function () {
  'use strict';
  const { $, getJSON } = AW, TT = AW.traffic, RC = AW.trafficRec, ON = 'aiarg-traffic-rec-on';
  const [RJ, MJ, cfg] = await Promise.all([getJSON('data/roads.json'), getJSON('data/model.json'), getJSON('exhibition/config.json').catch(() => ({}))]);
  TT.setConfigKey(cfg.tomtomKey);
  const SEG = RC.segments(RJ, MJ.centre), C = MJ.circle.coordinates[0];
  const BOX = [Math.min(...C.map(c => c[0])), Math.min(...C.map(c => c[1])), Math.max(...C.map(c => c[0])), Math.max(...C.map(c => c[1]))];
  let on = false, busy = false, lock = null;
  try { on = localStorage.getItem(ON) === '1'; } catch (e) { }
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const qtr = d => Math.floor((d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / RC.STEP) * RC.STEP;
  const hhmm = t => pad(Math.floor(t / 3600)) + ':' + pad(Math.floor(t % 3600 / 60));
  const msg = t => { $('#msg').textContent = t; };

  async function snapshot(manual) {
    if (busy) return; busy = true;
    const d = new Date(), date = ymd(d), t = qtr(d);
    try {
      const res = await TT.load(BOX, TT.Z);
      if (!res.ok) { msg(`${hhmm(t)}: no snapshot, ${TT.why[res.why]}${res.status ? ' (HTTP ' + res.status + ')' : ''}. Try Test key on the Projection page.`); return; }
      const lv = RC.sample(SEG, res.tiles), r = RC.read();
      // each day remembers how many roads it was read for; a day made with an older road list is kept but not replayed
      r.nseg = SEG.length; if (r.days[date] && (r.days[date].n || SEG.length) !== SEG.length) delete r.days[date];
      r.days[date] = r.days[date] || { wd: d.getDay(), n: SEG.length, steps: {} }; r.days[date].steps[t] = lv;
      if (!RC.write(r)) { msg('This browser would not store any more. Export, then delete old days.'); return; }
      const cov = [...lv].filter(c => c !== '-').length, slow = [...lv].filter(c => c === '2' || c === '3').length;
      msg(`${hhmm(t)}${manual ? ' (manual)' : ''}: ${cov} of ${SEG.length} main roads read, ${slow} slow or queuing.`);
    } catch (e) { msg('Snapshot failed: ' + e.message); }
    finally { busy = false; draw(); }
  }
  async function wake() { try { if (on && 'wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

  function tick() {
    if (!on) return draw();
    const d = new Date(), r = RC.read(), D = r.days[ymd(d)];
    if (!(D && D.steps[qtr(d)] !== undefined)) snapshot(false);
    draw();
  }
  function draw() {
    $('#state').textContent = on ? 'Recording' : 'Stopped'; $('#go').textContent = on ? 'Stop recording' : 'Start recording';
    const d = new Date(), nx = qtr(d) + RC.STEP; $('#next').textContent = on ? hhmm(nx % 86400) : '–';
    const r = RC.read(), today = r.days[ymd(d)], n = today ? Object.keys(today.steps).length : 0;
    $('#prog').style.width = (n / 96 * 100).toFixed(1) + '%'; $('#progTxt').textContent = `Today: ${n} of 96 snapshots.`;
    $('#key').textContent = TT.key() ? TT.describe() : 'No key in this browser: save it on the kiosk staff panel or the Projection page first.';
    const best = RC.bestDay(), WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $('#days').innerHTML = '<tr><th>Day</th><th>Snapshots</th><th>Midnight → midnight</th><th></th></tr>' + Object.keys(r.days).sort().reverse().map(k => {
      const D = r.days[k], cells = [];
      for (let q = 0; q < 96; q++) { const l = D.steps[q * RC.STEP]; if (l === undefined) { cells.push('<i></i>'); continue; } const c = [...l].filter(x => x !== '-'), s = c.length ? c.filter(x => x >= '2').length / c.length : 0; cells.push(`<i style="background:rgb(${Math.round(60 + 195 * Math.min(1, s * 4))},${Math.round(180 - 150 * Math.min(1, s * 4))},70)" title="${hhmm(q * RC.STEP)}"></i>`); }
      const old = (D.n || r.nseg) !== SEG.length;
      return `<tr${old ? ' style="opacity:.5"' : ''}><td>${WD[D.wd]} ${k}${old ? ' (older road list, not replayed)' : ''}</td><td>${Object.keys(D.steps).length}</td><td><div class="strip">${cells.join('')}</div></td><td>${best && best.date === k ? '<b>used for the replay</b>' : ''}</td></tr>`;
    }).join('');
  }
  $('#go').onclick = () => { on = !on; try { localStorage.setItem(ON, on ? '1' : '0'); } catch (e) { } if (on) { wake(); tick(); } else if (lock) { lock.release(); } draw(); };
  $('#now').onclick = () => snapshot(true);
  $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(RC.read())], { type: 'application/json' })); a.download = `sligo-traffic-${ymd(new Date())}.json`; a.click(); };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const inc = JSON.parse(await f.text()), r = RC.read();       Object.entries(inc.days || {}).forEach(([k, D]) => { D.n = D.n || inc.nseg; r.days[k] = r.days[k] ? { wd: D.wd, steps: Object.assign({}, r.days[k].steps, D.steps) } : D; }); RC.write(r); RC._c = null; msg('Imported.'); }
    catch (err) { msg('Could not import: ' + err.message); }
    draw();
  };
  $('#clr').onclick = () => { if (confirm('Delete every recorded day in this browser?')) { RC.write({ v: 1, days: {} }); RC._c = null; draw(); } };
  setInterval(tick, 30000); tick(); wake();
})().catch(e => { console.error(e); const m = document.getElementById('msg'); if (m) m.textContent = 'The recorder could not start: ' + e.message; });
