/* Story screen (screen.html): the large monitor beside the model. The kiosk sends what the model shows
   ({t:'screen'}) and a picture of its map ({t:'screen-map'}); this page only draws them. Photographs for a topic
   come from exhibition/config.json "screenImages"; without one the screen shows the kiosk's map. */
(function () {
  'use strict';
  const { $, esc } = AW;
  const id = Math.random().toString(36).slice(2);
  const B = AW.bus(onMsg);
  let cur = null, mapSrc = '', want = '';

  function hello() { B.send({ t: 'hello', who: 'screen', id }); }
  hello(); setInterval(hello, 5000);                       // the kiosk answers with what it is showing now
  addEventListener('beforeunload', () => B.send({ t: 'bye', who: 'screen', id }));

  const MAPCAP = 'What the model shows now, seen from the kiosk', failed = new Set();
  const photo = () => cur && cur.img && !failed.has(cur.img.file) ? cur.img : null;
  function onMsg(m) {
    if (m.t === 'screen-ping') hello();
    else if (m.t === 'screen') show(m.s);
    else if (m.t === 'screen-map') { mapSrc = m.src; if (!photo()) { $('#img').classList.remove('stale'); picture(mapSrc, MAPCAP); } }
  }
  function pick() {                                        // a photograph for the topic, else the kiosk's map, else the model
    const p = photo();
    if (p) picture(p.file, [p.caption, p.credit].filter(Boolean).join(' · '));
    else if (mapSrc) picture(mapSrc, MAPCAP);
    else picture('img/model-overview.jpg', 'The 52 printed tiles of the model, assembled');
  }

  const nb = t => String(t || '').replace(/(\d)-in-(\d)/g, '$1\u2011in\u2011$2');   // keep "1-in-100" on one line
  function show(s) {
    s.h = nb(s.h); s.text = nb(s.text); if (s.water) s.water = nb(s.water);
    const same = cur && cur.h === s.h && cur.text === s.text;
    const draw = () => {
      $('#h').textContent = s.h; $('#text').textContent = s.text;
      $('#water').hidden = !s.water; $('#water').textContent = s.water ? 'Water: ' + s.water : '';
      $('#stats').innerHTML = (s.stats || []).slice(0, 4).map(([v, l, hot]) => `<div class="s-stat${hot ? ' hot' : ''}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
      chart(s.chart);
      $('#legend').innerHTML = (s.legend || []).map(([c, t]) => `<div><i style="background:${esc(c)}"></i>${esc(t)}</div>`).join('');
      $('#s').classList.remove('swap');
    };
    const story = s.mode === 'story';
    $('#kicker').textContent = story ? `The story · ${s.step[0] + 1} of ${s.step[1]}` : 'On the model now';
    $('#steps').innerHTML = story ? Array.from({ length: s.step[1] }, (_, j) => `<i${j === s.step[0] ? ' class="on"' : ''}></i>`).join('') : '';
    const changed = !cur || JSON.stringify(cur.legend) !== JSON.stringify(s.legend) || cur.h !== s.h;
    cur = s;
    if (!photo() && want === mapSrc && changed) $('#img').classList.add('stale');   // the old map until the kiosk sends a new one
    pick();
    if (same) draw(); else { $('#s').classList.add('swap'); setTimeout(draw, 450); }
  }

  // fade out, swap, fade in once the new picture has loaded
  function picture(src, caption) {
    if (want === src) { $('#cap').textContent = caption; return; }
    want = src; const im = $('#img');
    im.classList.remove('on');
    setTimeout(() => {
      const pre = new Image();
      pre.onload = () => { if (want !== src) return; im.src = src; im.classList.toggle('stale', false); $('#cap').textContent = caption; im.classList.add('on'); };
      pre.onerror = () => { if (want !== src) return; failed.add(src); want = ''; if (!src.startsWith('img/')) pick(); };
      pre.src = src;
    }, im.getAttribute('src') ? 600 : 0);
  }

  function chart(c) {
    const el = $('#chart');
    if (!c || !c.bars || c.bars.length < 2) { el.hidden = true; return; }
    el.hidden = false;
    const n = c.bars.length, W = 1000, H = 240, top = 34, base = H - 36, max = Math.max(1, ...c.bars.map(b => b[1]));
    const gap = n > 12 ? 4 : 14, bw = (W - gap * (n - 1)) / n, every = Math.ceil(n / 12);
    const bars = c.bars.map(([l, v, on], i) => {
      const x = i * (bw + gap), h = Math.max(v ? 3 : 0, (base - top) * v / max), y = base - h;
      return `<g${on ? ' class="cur"' : ''}><rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${on ? 'var(--hot)' : '#2f6f86'}"/>`
        + (n <= 12 || on ? `<text class="v" x="${x + bw / 2}" y="${y - 8}" text-anchor="middle" font-size="22">${v.toLocaleString('en-IE')}</text>` : '')
        + (i % every === 0 || on ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="19">${esc(l)}</text>` : '') + '</g>';
    }).join('');
    el.innerHTML = `<h2>${esc(c.title)}</h2><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#1d3b45"/>${bars}</svg>`;
  }

  const clock = () => { $('#clock').textContent = new Date().toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }); };
  clock(); setInterval(clock, 15000);
  addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.().catch(() => { }); });
  setTimeout(() => $('#help').classList.add('gone'), 20000);
})();
